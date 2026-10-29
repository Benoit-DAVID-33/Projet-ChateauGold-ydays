"""Amelioration de prompt (prompt engineering) pour la video-to-video.

Transforme une demande utilisateur **naturelle, parfois vague** en un prompt
**structure**, adapte au modele cible (Kling, Luma, Decart, generique).

Deux modes :

- **regles** (toujours disponible, hors ligne) : detection de l'intention
  (ajouter / retirer / remplacer / restyler / recolorer / fond / meteo / angle /
  plan suivant ou precedent) puis application des **structures de prompt
  documentees par les fournisseurs** ;
- **LLM** (si un fournisseur texte est configure) : reecriture par le modele,
  avec la meme consigne de structure ; repli sur les regles en cas d'echec.

La clause « conserver » est ajoutee systematiquement : en video-to-video, dire
ce qui **ne doit pas** changer est aussi important que dire ce qui change.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field

logger = logging.getLogger("goldfx")

# --- Detection de l'intention -------------------------------------------------

_INTENTS: list[tuple[str, str]] = [
    ("previous_shot", r"\b(plan pr[ée]c[ée]dent|avant ce plan|previous shot)\b"),
    ("next_shot", r"\b(plan suivant|apr[èe]s ce plan|next shot)\b"),
    (
        "remove",
        r"\b(enl[èe]ve[rz]?|supprime[rz]?|retire[rz]?|efface[rz]?"
        r"|remove|delete|erase|get rid of)\b",
    ),
    ("add", r"\b(ajoute[rz]?|ins[èe]re[rz]?|add|insert)\b"),
    ("replace", r"\b(remplace[rz]?|remplacer|substitu|swap|replace|change .* (par|en|to|with))\b"),
    ("recolor", r"\b(couleur|colorie|recolor|teinte|paint .* (en|to))\b"),
    (
        "restyle",
        r"\b(style|anime|cartoon|manga|cyberpunk|aquarelle|watercolor|peinture"
        r"|oil painting|noir et blanc|black and white|pixel|clay|argile)\b",
    ),
    ("background", r"\b(fond|arri[èe]re[- ]plan|d[ée]cor|background|backdrop)\b"),
    (
        "weather",
        r"\b(pluie|pluvieux|neige|nuit|jour|orage|brouillard|soleil"
        r"|rain|snow|night|day|fog|storm)\b",
    ),
    (
        "angle",
        r"\b(angle|gros plan|close[- ]?up|plan large|wide shot"
        r"|contre[- ]?plong[ée]e|low angle|plong[ée]e|vue de)\b",
    ),
]

_DEFAULT_INTENT = "generic"

# --- Structures de prompt par modele (issues des documentations officielles) ---

_TEMPLATES: dict[str, dict[str, str]] = {
    "kling": {
        "add": "Ajoute {target} à {source}. Conserve le reste inchangé.",
        "remove": "Supprime {source}. Conserve le reste inchangé.",
        "replace": "Remplace {source} par {target} dans la vidéo. Conserve le reste inchangé.",
        "recolor": "Change la couleur de {source} en {target}. Conserve le reste inchangé.",
        "restyle": "Change la vidéo en style {target}. Conserve le mouvement et le cadrage.",
        "background": "Remplace le fond par {target}. Conserve le sujet et son mouvement.",
        "weather": "Change la vidéo pour {target}. Conserve le sujet et le cadrage.",
        "angle": "Génère {target} dans la vidéo. Conserve le sujet et l'action.",
        "next_shot": "À partir de la vidéo, génère le plan suivant : {target}.",
        "previous_shot": "À partir de la vidéo, génère le plan précédent : {target}.",
        "generic": "{target}. Conserve le sujet, le cadrage et la lumière d'origine.",
    },
    "luma": {
        "add": "Ajoute {target} à {source}.",
        "remove": "Retire {source} de la vidéo.",
        "replace": "Remplace {source} par {target}.",
        "recolor": "Change la couleur de {source} en {target}.",
        "restyle": "Transforme la scène en {target}.",
        "background": "Remplace le fond par {target}.",
        "weather": "Fais passer la scène à {target}.",
        "angle": "Montre {target}.",
        "next_shot": "{target}.",
        "previous_shot": "{target}.",
        "generic": "{target}.",
    },
    "decart": {
        "add": "Ajoute {target} à {source}.",
        "remove": "Retire {source}.",
        "replace": "Remplace {source} par {target}.",
        "recolor": "Change la couleur de {source} en {target}.",
        "restyle": "Transforme en style {target}.",
        "background": "Remplace le fond par {target}.",
        "weather": "Change la scène pour {target}.",
        "angle": "Montre {target}.",
        "next_shot": "{target}.",
        "previous_shot": "{target}.",
        "generic": "{target}.",
    },
    "generic": {
        "add": "Ajoute {target} à {source}.",
        "remove": "Supprime {source}.",
        "replace": "Remplace {source} par {target}.",
        "recolor": "Change la couleur de {source} en {target}.",
        "restyle": "Applique le style {target}.",
        "background": "Remplace le fond par {target}.",
        "weather": "Change la météo en {target}.",
        "angle": "Montre {target}.",
        "next_shot": "Génère le plan suivant : {target}.",
        "previous_shot": "Génère le plan précédent : {target}.",
        "generic": "{target}.",
    },
}

_KEEP_CLAUSE = "Conserve le sujet, la pose, le cadrage, le fond et la lumière d'origine."
_EDIT_INTENTS = {"add", "remove", "replace", "recolor", "background"}
_MULTI_INTENT_TIP = (
    "Plusieurs modifications détectées : les modèles préfèrent un prompt par "
    "modification (relancez une génération pour la seconde)."
)

_MODEL_TIPS: dict[str, list[str]] = {
    "kling": [
        "Kling O1 accepte les structures « Ajoute … à @video », « Supprime … de @video », "
        "« Remplace … par … ».",
        "Une seule modification par prompt donne de meilleurs résultats.",
    ],
    "luma": [
        "Ray 3.2 est nettement meilleur avec des keyframes : épinglez l'apparence aux images clés.",
        "La source doit faire 18 s maximum.",
    ],
    "decart": [
        "Formulez une seule édition par prompt (ajouter, remplacer, attribut ou style).",
        "Décrivez l'image de référence si vous en fournissez une.",
    ],
    "generic": [
        "Indiquez le sujet visé (ex. « la personne à gauche ») pour éviter les ambiguïtés.",
    ],
}

_COMMON_TIPS = [
    "Écrivez en anglais : les modèles suivent mieux les prompts anglais.",
    "Décrivez ce qui doit rester identique (pose, mains, cadrage, fond, lumière).",
    "Soyez précis : « veste rouge en maille » plutôt que « veste ».",
    "20 à 40 mots donnent de meilleurs résultats que 3 mots.",
]

# --- Extraction des parties (sujet / cible) -----------------------------------

_REPLACE_PATTERNS = [
    re.compile(
        r"(?:remplace[rz]?|remplacer|change[rz]?|substitue[rz]?)"
        r"\s+(.+?)\s+(?:par|en|avec|to|with)\s+(.+)",
        re.I,
    ),
    re.compile(r"(?:swap|replace)\s+(.+?)\s+(?:with|for|to)\s+(.+)", re.I),
]
_ADD_PATTERN = re.compile(r"(?:ajoute[rz]?|ins[èe]re[rz]?|add|insert)\s+(.+)", re.I)
_REMOVE_PATTERN = re.compile(
    r"(?:enl[èe]ve[rz]?|supprime[rz]?|retire[rz]?|efface[rz]?|remove|delete|erase)\s+(.+)", re.I
)
_STYLE_PATTERN = re.compile(r"(?:style|en|to)\s+(.+?)(?:\s+style)?$", re.I)


def _clean(value: str) -> str:
    """Nettoie un fragment extrait (ponctuation finale, espaces)."""
    return value.strip().strip(".,;:!?«»\"'").strip()


def _extract_parts(text: str, intent: str) -> dict:
    """Extrait le sujet et la cible d'une demande, selon l'intention."""
    cleaned = _clean(text)
    if intent in {"replace", "recolor"}:
        for pattern in _REPLACE_PATTERNS:
            match = pattern.search(cleaned)
            if match:
                return {
                    "source": _clean(_truncate_at_second_intent(match.group(1))),
                    "target": _clean(_truncate_at_second_intent(match.group(2))),
                }
    if intent == "add":
        match = _ADD_PATTERN.search(cleaned)
        if match:
            return {
                "target": _clean(_truncate_at_second_intent(match.group(1))),
                "source": "la vidéo",
            }
    if intent == "remove":
        match = _REMOVE_PATTERN.search(cleaned)
        if match:
            return {"source": _clean(_truncate_at_second_intent(match.group(1)))}
    if intent == "restyle":
        match = _STYLE_PATTERN.search(cleaned)
        if match:
            return {"target": _clean(_truncate_at_second_intent(match.group(1)))}
    return {"target": _clean(_truncate_at_second_intent(cleaned))}


def _detect_intents(text: str) -> list[str]:
    """Detecte toutes les intentions presentes dans une demande."""
    return [name for name, pattern in _INTENTS if re.search(pattern, text, re.I)]


def _detect_intent(text: str) -> str:
    """Detecte l'intention dominante d'une demande."""
    intents = _detect_intents(text)
    return intents[0] if intents else _DEFAULT_INTENT


_SPLIT_PATTERN = re.compile(r"\s+(?:et|puis|and|then)\s+|\s*,\s*", re.I)


def _truncate_at_second_intent(fragment: str) -> str:
    """Coupe un fragment des qu'une seconde intention commence (« X et mets Y »)."""
    for match in _SPLIT_PATTERN.finditer(fragment):
        tail = fragment[match.end() :]
        if any(re.search(pattern, tail, re.I) for _, pattern in _INTENTS):
            return fragment[: match.start()].strip()
    return fragment


@dataclass(frozen=True)
class PromptResult:
    """Resultat de l'amelioration d'un prompt."""

    original: str
    enhanced: str
    intent: str
    model: str
    keep: str
    tips: list[str] = field(default_factory=list)
    source: str = "rules"


def enhance_with_rules(text: str, model: str = "kling") -> PromptResult:
    """Ameliore un prompt par regles (hors ligne, deterministe)."""
    intents = _detect_intents(text)
    intent = intents[0] if intents else _DEFAULT_INTENT
    parts = _extract_parts(text, intent)
    templates = _TEMPLATES.get(model, _TEMPLATES["generic"])
    template = templates.get(intent, templates["generic"])
    try:
        enhanced = template.format(**{"source": "le sujet", "target": _clean(text), **parts})
    except (KeyError, IndexError):
        enhanced = _clean(text)

    tips = list(_COMMON_TIPS) + list(_MODEL_TIPS.get(model, _MODEL_TIPS["generic"]))
    if intent in _EDIT_INTENTS:
        tips.insert(0, _KEEP_CLAUSE)
    if len(intents) > 1:
        tips.insert(0, _MULTI_INTENT_TIP)
    return PromptResult(
        original=text,
        enhanced=enhanced.strip(),
        intent=intent,
        model=model,
        keep=_KEEP_CLAUSE,
        tips=tips,
        source="rules",
    )


_LLM_INSTRUCTION = (
    "Tu es expert en prompt engineering pour la génération vidéo (image/vidéo vers vidéo). "
    "Réécris la demande de l'utilisateur en UN prompt clair et précis pour le modèle {model}. "
    "Règles : une seule modification ; indique explicitement ce qui doit rester inchangé "
    "(sujet, pose, cadrage, fond, lumière) ; sois concret et descriptif ; 20 à 40 mots ; "
    "réponds uniquement par le prompt, sans préambule ni guillemets.\n\nDemande : {text}"
)


async def enhance_with_llm(text: str, model: str = "kling") -> PromptResult | None:
    """Ameliore un prompt via un fournisseur texte configure, ou None si indisponible."""
    from .llm import Capability, GenerationRequest, ProviderError, get_router

    prompt = _LLM_INSTRUCTION.format(model=model, text=text)
    try:
        result = await get_router().submit(
            GenerationRequest(
                capability=Capability.TEXT, prompt=prompt, options={"temperature": 0.4}
            )
        )
    except ProviderError as exc:
        logger.info("Amelioration LLM indisponible (%s) : repli sur les regles", exc.message)
        return None

    content = str(result.payload.get("text", "")).strip()
    if not content:
        return None

    base = enhance_with_rules(text, model)
    return PromptResult(
        original=text,
        enhanced=content,
        intent=base.intent,
        model=model,
        keep=base.keep,
        tips=base.tips,
        source="llm",
    )


async def enhance(text: str, model: str = "kling", use_llm: bool = False) -> PromptResult:
    """Ameliore un prompt : via LLM si demande et disponible, sinon par regles."""
    if use_llm:
        result = await enhance_with_llm(text, model)
        if result is not None:
            return result
    return enhance_with_rules(text, model)


def as_dict(result: PromptResult) -> dict:
    """Convertit un resultat en dictionnaire serialisable."""
    return asdict(result)
