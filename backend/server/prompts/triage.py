"""Tri des demandes (pre-traitement avant le prompt engineering).

Avant d'ecrire le moindre prompt, la demande est **classee** de facon
deterministe, sans LLM ni reseau :

1. ``split_edits`` : decoupage en modifications (« X puis a 15 s Y ») ;
2. ``timecodes.extract`` : moment de chaque modification ;
3. ``resolve_intent`` : ajouter / retirer / remplacer / recolorer / restyler /
   fond / meteo / lumiere / angle / plan suivant ou precedent ;
4. ``extract_parts`` : sujet vise et cible ;
5. ``cinema.detect`` : jargon de tournage a traduire fidelement ;
6. questions de clarification quand une information manque.

Le resultat (``analyze``) sert au gabarit par regles, a la consigne du LLM, au
choix du modele (``server.video_editing.routing``) et au chatbot.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from server.prompts import cinema, lexicon, timecodes

# --- Detection de l'intention -------------------------------------------------

_VERB_PATTERNS: dict[str, str] = {
    "previous_shot": r"\b(plan pr[ée]c[ée]dent|avant ce plan|previous shot|shot before)\b",
    "next_shot": r"\b(plan suivant|apr[èe]s ce plan|suite de la sc[èe]ne|next shot|shot after)\b",
    "remove": (
        r"\b(enl[èe]ve[rz]?|supprime[rz]?|retire[rz]?|efface[rz]?|fais dispara[iî]tre"
        r"|remove|delete|erase|get rid of)\b"
    ),
    "add": (
        r"\b(ajoute[rz]?|rajoute[rz]?|ins[èe]re[rz]?|int[èe]gre[rz]?|incruste[rz]?"
        r"|fais appara[iî]tre|add|insert|include)\b"
    ),
    # Verbes de placement ambigus : « mets un chapeau » (ajout) / « mets la nuit » (meteo).
    "put": (
        r"\b(mets|mettre|met|place[rz]?|pose[rz]?|[ée]claire[rz]?|illumine[rz]?"
        r"|put|light|relight)\b"
    ),
    "replace": (
        r"\b(remplace[rz]?|substitue[rz]?|change[rz]?|transforme[rz]?|rends|rendre"
        r"|swap|replace|change|turn|make|transform)\b"
    ),
}

_TOPIC_PATTERNS: dict[str, str] = {
    "recolor": r"\b(couleur|colorie[rz]?|recolor|teinte|teindre|colou?r)\b",
    "restyle": (
        r"\b(style|anime|cartoon|manga|cyberpunk|steampunk|aquarelle|watercolor|peinture"
        r"|painting|noir et blanc|black and white|pixel|clay|argile|ghibli|dessin|croquis"
        r"|sketch|p[âa]te [àa] modeler|bande dessin[ée]e|comic|r[ée]tro|vintage)\b"
    ),
    "background": r"\b(fond|arri[èe]re[- ]plan|d[ée]cor|background|backdrop)\b",
    "relight": (
        r"\b(lumi[èe]re|[ée]clairage|[ée]claire[rz]?|relight|lighting|lit|golden hour"
        r"|heure dor[ée]e|n[ée]ons?|contre[- ]jour)\b"
    ),
    "weather": (
        r"\b(pluie|pluvieu[xs]e?|neige|enneig[ée]e?|nuit|jour|orage|brouillard|brume|soleil"
        r"|coucher de soleil|aube|cr[ée]puscule|hiver|[ée]t[ée]|automne|printemps"
        r"|rain|snow|night|daytime|fog|storm|sunset|winter|summer|autumn)\b"
    ),
    "angle": (
        r"\b(angle|gros plan|close[- ]?up|plan large|wide shot|plan moyen|contre[- ]?plong[ée]e"
        r"|low angle|plong[ée]e|vue de|vue a[ée]rienne|aerial|top-down|point de vue)\b"
    ),
}

INTENTS = (
    "add",
    "remove",
    "replace",
    "recolor",
    "restyle",
    "background",
    "weather",
    "relight",
    "angle",
    "next_shot",
    "previous_shot",
    "generic",
)
DEFAULT_INTENT = "generic"
_COLOR_WORDS = {
    "rouge", "bleu", "bleue", "vert", "verte", "jaune", "orange", "violet", "violette", "rose",
    "noir", "noire", "blanc", "blanche", "gris", "grise", "marron", "brun", "brune", "beige",
    "doré", "dorée", "dore", "doree", "argenté", "argentée", "argente", "turquoise", "bordeaux",
    "fluo", "pastel", "foncé", "foncée", "fonce", "clair", "claire", "vif", "vive", "mat",
    "brillant", "brillante", "métallique", "metallique", "red", "blue", "green", "black",
    "white", "yellow", "purple", "pink", "gray", "grey", "brown", "gold", "golden", "silver",
    "dark", "light", "bright", "matte", "glossy", "metallic", "et", "and",
}  # fmt: skip


def _has(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.I) is not None


def detect_intents(text: str) -> list[str]:
    """Detecte toutes les intentions presentes (verbes puis themes)."""
    found = [name for name, pattern in _VERB_PATTERNS.items() if _has(pattern, text)]
    found += [name for name, pattern in _TOPIC_PATTERNS.items() if _has(pattern, text)]
    return found


def resolve_intent(text: str) -> str:
    """Intention dominante d'UNE modification (le verbe prime, le theme precise)."""
    verbs = {name for name, pattern in _VERB_PATTERNS.items() if _has(pattern, text)}
    topics = [name for name, pattern in _TOPIC_PATTERNS.items() if _has(pattern, text)]
    target = _replace_target(text)
    # Regles evaluees dans l'ordre : la premiere satisfaite l'emporte.
    rules: list[tuple[bool, str]] = [
        ("previous_shot" in verbs, "previous_shot"),
        ("next_shot" in verbs, "next_shot"),
        ("remove" in verbs, "remove"),
        ("recolor" in topics or bool(target and _is_color(target)), "recolor"),
        ("background" in topics and verbs <= {"replace", "add", "put"}, "background"),
        # « ajoute de la neige » reste un ajout ; « mets la nuit » est un changement de meteo.
        ("weather" in topics and "add" in verbs, "add"),
        *[(topic in topics, topic) for topic in ("restyle", "relight", "weather", "angle")],
        ("replace" in verbs, "replace" if target else DEFAULT_INTENT),
        (bool(verbs & {"add", "put"}), "add"),
    ]
    return next((intent for matched, intent in rules if matched), DEFAULT_INTENT)


def detect_intent(text: str) -> str:
    """Detecte l'intention dominante d'une demande."""
    return resolve_intent(text)


def _is_color(fragment: str) -> bool:
    words = [word.lower() for word in lexicon.tokenize(fragment)]
    meaningful = [word for word in words if word not in {"en", "le", "la", "un", "une", "to"}]
    return bool(meaningful) and all(
        word in _COLOR_WORDS or word in {"red", "blue", "green", "black", "white", "yellow"}
        for word in meaningful
    )


# --- Decoupage en modifications ----------------------------------------------

_SPLIT_PATTERN = re.compile(r"\s*(?:,|;|\bet\b|\bpuis\b|\bensuite\b|\band\b|\bthen\b)\s*", re.I)
# Verbes « neutres » : ils ouvrent une modification sans en fixer l'intention.
_NEUTRAL_VERBS = r"\b(fais|fait|faire|g[ée]n[èe]re[rz]?|cr[ée]e[rz]?|generate|create|do)\b"
_ANY_VERB = "|".join([*_VERB_PATTERNS.values(), _NEUTRAL_VERBS])


def split_edits(text: str) -> list[str]:
    """Decoupe « X et Y » en modifications, seulement si Y commence par un verbe d'action."""
    clauses: list[str] = []
    start = 0
    for match in _SPLIT_PATTERN.finditer(text):
        tail = text[match.end() :]
        if re.match(rf"\s*(?:{timecodes.LEADING_TIME}\s*,?\s*)?(?:{_ANY_VERB})", tail, re.I):
            clauses.append(text[start : match.start()])
            start = match.end()
    clauses.append(text[start:])
    return [clean(clause) for clause in clauses if clean(clause)]


# --- Extraction des parties (sujet / cible) -----------------------------------

_REPLACE_PATTERNS = [
    re.compile(
        r"(?:remplace[rz]?|substitue[rz]?|change[rz]?|transforme[rz]?|rends|teins)"
        r"\s+(.+?)\s+(?:par|en|avec)\s+(.+)",
        re.I,
    ),
    re.compile(
        r"(?:swap|replace|change|turn|transform|make)\s+(.+?)\s+(?:with|for|to|into)\s+(.+)",
        re.I,
    ),
]
# « rends la voiture rouge » / « make the car red » : couleur en fin de phrase.
_MAKE_COLOR = re.compile(r"(?:rends|rendre|peins|make|paint)\s+(.+?)\s+(\S+)$", re.I)
_SCENE_PREFIX = re.compile(
    r"^(?:la scène|la scene|la vidéo|la video|l'image|the scene|the video|it)"
    r"(?:\s+(?:avec|with|en|de|à|a|:))?\s*",
    re.I,
)
_STRIP_VERB = re.compile(
    rf"^\s*(?:{_ANY_VERB})\s+(?:moi\s+|nous\s+)?",
    re.I,
)
_STYLE_PATTERN = re.compile(r"\b(?:style|en|to|into|as)\s+(.+?)(?:\s+style)?$", re.I)
_SHOT_PATTERN = re.compile(
    r"(?:plan (?:suivant|pr[ée]c[ée]dent)|(?:next|previous) shot)\s*:?\s*(.*)", re.I
)
_COLOR_SOURCE = re.compile(r"(?:la\s+)?couleur\s+(?:de\s+|du\s+|des\s+|d')(.+)", re.I)
_BACKGROUND_SOURCE = re.compile(
    r"^(?:le |the )?(?:fond|arri[èe]re[- ]plan|d[ée]cor|background)\b", re.I
)


def clean(value: str) -> str:
    """Nettoie un fragment extrait (ponctuation finale, espaces)."""
    return value.strip().strip(".,;:!?«»\"'").strip()


def _strip_verb(text: str) -> str:
    return _STRIP_VERB.sub("", text, count=1)


def _replace_target(text: str) -> str:
    for pattern in _REPLACE_PATTERNS:
        match = pattern.search(text)
        if match:
            return clean(match.group(2))
    match = _MAKE_COLOR.search(clean(text))
    if match and _is_color(match.group(2)):
        return match.group(2)
    return ""


def extract_parts(text: str, intent: str) -> dict[str, str]:
    """Extrait le sujet (``source``) et la cible (``target``) d'une modification."""
    cleaned = clean(text)
    if intent in {"replace", "recolor", "background"}:
        for pattern in _REPLACE_PATTERNS:
            match = pattern.search(cleaned)
            if match:
                source = clean(match.group(1))
                color = _COLOR_SOURCE.match(source)
                if color:
                    source = clean(color.group(1))
                return {"source": source, "target": clean(match.group(2))}
        match = _MAKE_COLOR.search(cleaned)
        if match and _is_color(match.group(2)):
            return {"source": clean(match.group(1)), "target": match.group(2)}
    if intent == "remove":
        return {"source": clean(_strip_verb(cleaned))}
    if intent == "restyle":
        match = _STYLE_PATTERN.search(cleaned)
        if match:
            return {"target": clean(match.group(1))}
    if intent in {"next_shot", "previous_shot"}:
        match = _SHOT_PATTERN.search(cleaned)
        if match:
            return {"target": clean(match.group(1))}
    stripped = clean(_strip_verb(cleaned))
    if intent in {"weather", "relight", "angle", "restyle"}:
        stripped = clean(_SCENE_PREFIX.sub("", stripped))
    if intent == "background":
        stripped = clean(
            re.sub(
                r"^(?:un |une |le |la )?(?:fond|arri[èe]re[- ]plan|d[ée]cor)\s+",
                "",
                stripped,
                flags=re.I,
            )
        )
    return {"target": stripped or cleaned, "source": "the subject"}


# --- Analyse complete ---------------------------------------------------------


@dataclass(frozen=True)
class TriagedEdit:
    """Une modification classee."""

    instruction: str
    intent: str
    subject: str
    target: str
    timing: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Triage:
    """Resultat du tri d'une demande."""

    edits: list[TriagedEdit]
    cinema_terms: list[dict]
    questions: list[str]
    language: str

    def as_dict(self) -> dict:
        """Representation JSON."""
        return asdict(self)


_VAGUE_TARGETS = {"", "the subject", "le sujet", "quelque chose", "something", "ça", "ca"}


def _timing(window: timecodes.TimeWindow) -> dict:
    values = (
        ("start", window.start),
        ("end", window.end),
        ("length", window.length),
        ("anchor", window.anchor),
    )
    return {key: value for key, value in values if value not in (None, "")}


def _questions(edit: TriagedEdit) -> list[str]:
    asks = []
    if edit.intent == DEFAULT_INTENT:
        asks.append(
            f"« {edit.instruction} » : voulez-vous ajouter, retirer, remplacer ou "
            "restyler quelque chose ?"
        )
    elif edit.intent == "remove" and edit.subject.lower() in _VAGUE_TARGETS:
        asks.append("Que faut-il retirer exactement (objet, personne, position à l'écran) ?")
    elif edit.intent in {"add", "replace"} and len(edit.target.split()) < 3:
        asks.append(
            f"Pouvez-vous décrire « {edit.target or edit.instruction} » (taille, couleur, "
            "matière, position, action) ? Un prompt précis donne un meilleur rendu."
        )
    return asks


def analyze(text: str) -> Triage:
    """Classe une demande en modifications datees, avec jargon et questions."""
    edits: list[TriagedEdit] = []
    for clause in split_edits(text) or [clean(text)]:
        window, instruction = timecodes.extract(clause)
        intent = resolve_intent(instruction)
        parts = extract_parts(instruction, intent)
        edits.append(
            TriagedEdit(
                instruction=instruction,
                intent=intent,
                subject=parts.get("source", ""),
                target=parts.get("target", ""),
                timing=_timing(window),
            )
        )
    terms = cinema.detect(text)
    questions = [question for edit in edits for question in _questions(edit)]
    return Triage(
        edits=edits,
        cinema_terms=[
            {"french": t.french, "english": t.english, "category": t.category} for t in terms
        ],
        questions=questions,
        language="en" if lexicon.looks_english(text) else "fr",
    )
