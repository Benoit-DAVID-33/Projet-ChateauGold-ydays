"""Amelioration de prompt (prompt engineering) pour la video-to-video.

Transforme une demande utilisateur **naturelle, parfois vague** (« enleve le
mec derriere et mets de la neige ») en prompt(s) **structure(s)**, adaptes au
modele cible : Kling (O1 / 3.0 Omni), Runway Aleph, Luma Ray, Decart Lucy,
Seedance, xAI Grok Imagine, Wan, ou generique.

Chaine de conversion (mode « regles », hors ligne et deterministe) :

1. **decoupage** de la demande en modifications (« X et Y » -> 2 etapes) :
   les modeles font mieux **une** modification par generation ;
2. **intention** de chaque etape (ajouter, retirer, remplacer, recolorer,
   restyler, fond, meteo, lumiere, angle, plan suivant/precedent) ;
3. **extraction** du sujet vise et de la cible ;
4. **traduction** francais -> anglais (``prompt_lexicon``) ; si un mot est
   inconnu, le prompt reste en francais plutot que melanger les langues ;
5. **gabarit du modele** (syntaxe documentee : ``<<<video_1>>>`` pour Kling,
   mot declencheur pour Decart/Seedance, description du resultat pour Luma),
   **enrichissement** (integration, lumiere, coherence temporelle) et clause
   « conserver » quand le modele en tire profit ;
6. **parametres recommandes** (ex. ``refer_type`` Kling) et prompt negatif.

Le mode **LLM** (fournisseur texte gratuit configure) reecrit la demande avec
la fiche du modele et le brouillon par regles comme guide, en JSON valide ;
repli automatique sur les regles en cas d'echec.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field, replace

from server.core.caching import TTLCache
from server.prompts import cinema, lexicon, timecodes, triage

logger = logging.getLogger("goldfx")

# --- Fiches modeles -----------------------------------------------------------

_KEEP_ELEMENTS_EN: dict[str, list[str]] = {
    "add": ["the subject's identity", "pose", "motion", "camera framing", "background", "lighting"],
    "remove": ["the subject's identity", "motion", "camera framing", "lighting"],
    "replace": ["motion", "camera framing", "background", "lighting"],
    "recolor": ["shape", "texture", "motion", "camera framing", "background", "lighting"],
    "restyle": ["motion", "composition", "camera movement", "timing"],
    "background": ["the subject's identity", "pose", "motion", "camera framing"],
    "weather": ["the subject's identity", "pose", "motion", "camera framing"],
    "relight": ["the subject's identity", "pose", "motion", "camera framing", "colors"],
    "angle": ["the subject's identity", "action", "wardrobe", "lighting"],
    "next_shot": ["the subject's identity", "wardrobe", "lighting", "visual style"],
    "previous_shot": ["the subject's identity", "wardrobe", "lighting", "visual style"],
    "generic": ["the subject's identity", "motion", "camera framing", "lighting"],
}

_ENRICH_EN: dict[str, str] = {
    "add": "naturally integrated, matching the scene's perspective, scale and lighting",
    "remove": "filling the area with a plausible, consistent background",
    "replace": "matching the original motion, scale and lighting",
    "recolor": "keeping the original texture and shading",
    "restyle": "consistent across every frame",
    "background": "with matching light direction and clean, natural edges around the subject",
    "weather": "with realistic, physically consistent effects",
    "relight": "with realistic shadows and reflections",
    "angle": "",
    "next_shot": "with continuous action and seamless continuity",
    "previous_shot": "with continuous action and seamless continuity",
    "generic": "",
}

_NEGATIVE_BASE = (
    "blurry, flickering, temporal inconsistency, distorted face, warped hands, extra limbs, "
    "morphing background, text, watermark, low quality"
)

_INSTRUCTION_EN: dict[str, str] = {
    "add": "Add {target} to {ref}",
    "remove": "Remove {source} from {ref}",
    "replace": "Replace {source} in {ref} with {target}",
    "recolor": "Change the color of {source} in {ref} to {target}",
    "restyle": "Restyle {ref} in {target_style}",
    "background": "Replace the background of {ref} with {target}",
    "weather": "Change the weather and time of day in {ref}: {target}",
    "relight": "Relight {ref}: {target}",
    "angle": "Change the camera angle of {ref}: {target}",
    "next_shot": "Based on {ref}, generate the next shot: {target}",
    "previous_shot": "Based on {ref}, generate the previous shot: {target}",
    "generic": "Edit {ref}: {target}",
}

# Luma Ray (modify) : on decrit le RESULTAT voulu plutot qu'une instruction.
_DESCRIPTIVE_EN: dict[str, str] = {
    "add": "The same scene, now with {target}",
    "remove": "The same scene without {source}",
    "replace": "The same scene, with {target} in place of {source}",
    "recolor": "The same scene, with {source} now {target}",
    "restyle": "The same scene rendered in {target_style}",
    "background": "The same subject and motion, set in {target}",
    "weather": "The same scene during {target}",
    "relight": "The same scene lit by {target}",
    "angle": "The same scene seen as {target}",
    "next_shot": "The next shot of the scene: {target}",
    "previous_shot": "The previous shot of the scene: {target}",
    "generic": "The same scene: {target}",
}

_INSTRUCTION_FR: dict[str, str] = {
    "add": "Ajoute {target} à {ref}",
    "remove": "Supprime {source} de {ref}",
    "replace": "Remplace {source} par {target} dans {ref}",
    "recolor": "Change la couleur de {source} en {target} dans {ref}",
    "restyle": "Transforme {ref} en style {target}",
    "background": "Remplace le fond de {ref} par {target}",
    "weather": "Change la météo et le moment de la journée de {ref} : {target}",
    "relight": "Change l'éclairage de {ref} : {target}",
    "angle": "Montre {ref} en {target}",
    "next_shot": "À partir de {ref}, génère le plan suivant : {target}",
    "previous_shot": "À partir de {ref}, génère le plan précédent : {target}",
    "generic": "Modifie {ref} : {target}",
}
_KEEP_FR = (
    "Conserve le reste inchangé : sujet, pose, mouvement, cadrage, fond et lumière d'origine."
)


@dataclass(frozen=True)
class ModelProfile:
    """Fiche de prompt engineering d'un modele video-to-video."""

    key: str
    label: str
    reference_en: str
    reference_fr: str
    style: str = "instruction"  # instruction | descriptive
    keep_clause: bool = True
    enrich: bool = True
    negative: bool = False
    max_chars: int = 2500
    guide: str = ""
    tips: tuple[str, ...] = ()


PROFILES: dict[str, ModelProfile] = {
    "kling": ModelProfile(
        key="kling",
        label="Kling VIDEO O1 / Kling 3.0 Omni (édition vidéo)",
        reference_en="<<<video_1>>>",
        reference_fr="<<<video_1>>>",
        negative=True,
        guide=(
            "Kling Omni video editing (refer_type=base). Reference the source clip as "
            "<<<video_1>>> and reference images as <<<image_1>>>, <<<image_2>>>. Use an "
            "imperative instruction (Add/Remove/Replace/Change/Restyle ... <<<video_1>>>), one "
            "edit per prompt, concrete visual details (material, color, size, position), then "
            "state what must stay unchanged (identity, pose, motion, camera, lighting)."
        ),
        tips=(
            "Kling Omni : la vidéo source se référence par <<<video_1>>> (images : "
            "<<<image_1>>>…).",
            "Vidéo source de 3 à 10 s, 200 Mo maximum ; en édition (refer_type « base ») la "
            "durée de sortie = durée de la source.",
            "Plan suivant / précédent ou reprise du style d'une vidéo : refer_type « feature ».",
        ),
    ),
    "runway": ModelProfile(
        key="runway",
        label="Runway Aleph 2.0 (aleph2, video-to-video)",
        reference_en="the video",
        reference_fr="la vidéo",
        max_chars=1000,
        guide=(
            "Runway Aleph video-to-video. Short imperative instruction describing the visual "
            "transformation explicitly (object, style, lighting, color grade or camera); can "
            "also generate the next shot or a new camera angle. Max 1000 characters."
        ),
        tips=(
            "Runway Aleph : prompt limité à 1000 caractères ; décrivez explicitement la "
            "transformation (objet, style, lumière, étalonnage).",
            "Aleph sait aussi générer un nouvel angle ou le plan suivant.",
        ),
    ),
    "luma": ModelProfile(
        key="luma",
        label="Luma Ray 3.2 (video_edit / Modify)",
        reference_en="the video",
        reference_fr="la vidéo",
        style="descriptive",
        keep_clause=False,
        guide=(
            "Luma Ray video_edit (Modify). Describe the desired RESULTING scene, not an "
            "instruction; keep it visual and concrete. Structure is preserved by the 'strength' "
            "parameter (adhere / flex / reimagine), not by the prompt."
        ),
        tips=(
            "Luma : décrivez la scène finale ; la fidélité se règle avec « strength » "
            "(adhere / flex / reimagine).",
            "Source de 18 s maximum ; épinglez l'apparence avec des keyframes.",
        ),
    ),
    "decart": ModelProfile(
        key="decart",
        label="Decart Lucy 2.5 (édition vidéo)",
        reference_en="the video",
        reference_fr="la vidéo",
        keep_clause=False,
        guide=(
            "Decart Lucy video editing. Start with a trigger word (Add, Remove, Replace, Change, "
            "Transform), describe the target precisely in about 20-30 words (exact shade, "
            "material, finish: matte/glossy/metallic). Do NOT mention keeping motion or pose: "
            "the model preserves them and mentioning it can confuse the edit."
        ),
        tips=(
            "Decart : commencez par un mot déclencheur (Add, Remove, Replace, Change).",
            "Ne précisez pas « garder la pose / le mouvement » : Lucy les conserve déjà et "
            "cela peut perturber l'édition.",
            "Couleurs : nuance exacte + finition (mat, brillant, métallisé).",
        ),
    ),
    "seedance": ModelProfile(
        key="seedance",
        label="Seedance 2.5 (mode édition)",
        reference_en="the video",
        reference_fr="la vidéo",
        guide=(
            "Seedance edit mode. The edit is detected from trigger words: edit, remove, add, "
            "replace, change to, restyle, relight. One edit per prompt, concrete details, then "
            "what stays unchanged."
        ),
        tips=(
            "Seedance détecte l'édition par ses mots déclencheurs (remove, add, replace, "
            "change to, restyle, relight).",
            "N'envoyez pas de durée entière en édition : elle serait interprétée comme une "
            "extension de la vidéo.",
        ),
    ),
    "xai": ModelProfile(
        key="xai",
        label="xAI Grok Imagine (grok-imagine-video, édition)",
        reference_en="the video",
        reference_fr="la vidéo",
        guide=(
            "xAI grok-imagine-video editing. Imperative edit instruction with concrete details; "
            "duration, aspect ratio and resolution follow the source (max 720p, source <= 8.7 s)."
        ),
        tips=(
            "Grok Imagine : source de 8,7 s maximum ; durée, ratio et résolution suivent la "
            "source (720p max).",
        ),
    ),
    "wan": ModelProfile(
        key="wan",
        label="Wan 2.7 Edit / Wan VACE (open source)",
        reference_en="the video",
        reference_fr="la vidéo",
        negative=True,
        guide=(
            "Wan video editing (Wan 2.7 Edit API or open-source Wan VACE). Clear English "
            "instruction plus a description of the visual details; a negative prompt is supported."
        ),
        tips=(
            "Wan VACE (open source) s'exécute en local sur GPU : gratuit mais exigeant en VRAM.",
            "Wan accepte un prompt négatif : utilisez-le pour les artefacts récurrents.",
        ),
    ),
    "generic": ModelProfile(
        key="generic",
        label="Modèle générique",
        reference_en="the video",
        reference_fr="la vidéo",
        negative=True,
        guide="Generic instruction-based video editing model.",
        tips=("Indiquez le sujet visé (ex. « la personne à gauche ») pour éviter les ambiguïtés.",),
    ),
}

SUPPORTED_MODELS = tuple(PROFILES)

_COMMON_TIPS = [
    "Une seule modification par génération : enchaînez les étapes proposées.",
    "Soyez précis : « veste en cuir rouge mat » plutôt que « veste ».",
    "Désignez le sujet sans ambiguïté (« la personne à gauche », « la voiture au premier plan »).",
]
_MULTI_EDIT_TIP = (
    "Plusieurs modifications détectées : elles ont été découpées en étapes, à lancer "
    "l'une après l'autre (chaque sortie devient la source de l'étape suivante)."
)
_UNTRANSLATED_TIP = (
    "Certains mots n'ont pas pu être traduits hors ligne : le prompt reste en français. "
    "Activez le mode LLM (fournisseur gratuit) pour une version anglaise, mieux suivie."
)


@dataclass(frozen=True)
class PromptStep:
    """Une modification elementaire (un prompt par generation).

    ``timing`` reprend le moment demande (``start``, ``end``, ``length``,
    ``anchor``) ; vide si la demande ne precisait aucun moment.
    """

    intent: str
    prompt: str
    negative_prompt: str = ""
    timing: dict = field(default_factory=dict)
    instruction: str = ""


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
    language: str = "en"
    negative_prompt: str = ""
    steps: list[PromptStep] = field(default_factory=list)
    params: dict = field(default_factory=dict)
    translated: bool = True


def _profile(model: str) -> ModelProfile:
    return PROFILES.get(model, PROFILES["generic"])


def _translate_parts(parts: dict[str, str], english_input: bool) -> tuple[dict[str, str], bool]:
    if english_input:
        return dict(parts), True
    translated: dict[str, str] = {}
    complete = True
    for key, value in parts.items():
        if value == "the subject":
            translated[key] = value
            continue
        text, ok = lexicon.translate(value)
        translated[key] = text or value
        complete = complete and ok
    return translated, complete


def _style_phrase(target: str) -> str:
    """« anime » -> « anime style » ; evite « style style »."""
    return target if re.search(r"\bstyle\b", target, re.I) else f"{target} style"


def _keep_sentence_en(intent: str) -> str:
    elements = _KEEP_ELEMENTS_EN.get(intent, _KEEP_ELEMENTS_EN["generic"])
    listed = ", ".join(elements[:-1]) + f" and {elements[-1]}" if len(elements) > 1 else elements[0]
    return f"Keep {listed} unchanged."


def _negative_for(intent: str, parts: dict[str, str]) -> str:
    extra = parts.get("source", "") if intent == "remove" else ""
    return f"{extra}, {_NEGATIVE_BASE}" if extra and extra != "the subject" else _NEGATIVE_BASE


_LOCATED = re.compile(
    r"\b(to|on|in|at|next to|behind|above|under|in front of|around|between)\b", re.I
)
_SHOT_INTENTS = {"next_shot", "previous_shot"}
_SHOT_WORD = {"next_shot": "next", "previous_shot": "previous"}
_LOCATED_FR = re.compile(r"(?:\s|^)(à|au|aux|sur|dans|derrière|devant)\s", re.I)


def _sentence(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return text
    text = text[0].upper() + text[1:]
    return text if text.endswith((".", "!", "?")) else f"{text}."


def _timing(window: timecodes.TimeWindow) -> dict:
    if not window.is_set:
        return {}
    return {
        key: value
        for key, value in (
            ("start", window.start),
            ("end", window.end),
            ("length", window.length),
            ("anchor", window.anchor),
        )
        if value not in (None, "")
    }


def _english_prompt(intent: str, parts: dict[str, str], profile: ModelProfile) -> tuple[str, str]:
    """Prompt anglais (gabarit + enrichissement + clause « keep ») et prompt negatif."""
    templates = _DESCRIPTIVE_EN if profile.style == "descriptive" else _INSTRUCTION_EN
    values = {
        "ref": profile.reference_en,
        "source": parts.get("source", "the subject"),
        "target": parts.get("target", ""),
        "target_style": _style_phrase(parts.get("target", "")),
    }
    empty_shot = intent in _SHOT_INTENTS and not values["target"]
    if empty_shot:
        main = (
            f"Based on {values['ref']}, generate the {_SHOT_WORD[intent]} shot, "
            "continuing the action naturally"
        )
    elif intent == "add" and profile.style != "descriptive" and _LOCATED.search(values["target"]):
        main = f"In {values['ref']}, add {values['target']}"
    else:
        main = templates.get(intent, templates["generic"]).format(**values)
    enrich = _ENRICH_EN.get(intent, "") if profile.enrich and not empty_shot else ""
    prompt = _sentence(f"{main}, {enrich}" if enrich else main)
    if profile.keep_clause:
        prompt = f"{prompt} {_keep_sentence_en(intent)}"
    negative = _negative_for(intent, parts) if profile.negative else ""
    return prompt, negative


def _french_prompt(intent: str, parts: dict[str, str], profile: ModelProfile) -> str:
    """Prompt francais (repli quand la traduction hors ligne est incomplete)."""
    values = {
        "ref": profile.reference_fr,
        "source": parts.get("source", "le sujet").replace("the subject", "le sujet"),
        "target": parts.get("target", ""),
    }
    if intent in _SHOT_INTENTS and not values["target"]:
        word = "suivant" if intent == "next_shot" else "précédent"
        main = f"À partir de {values['ref']}, génère le plan {word} dans la continuité de l'action"
    elif intent == "add" and _LOCATED_FR.search(values["target"]):
        main = f"Dans {values['ref']}, ajoute {values['target']}"
    else:
        main = _INSTRUCTION_FR.get(intent, _INSTRUCTION_FR["generic"]).format(**values)
    prompt = _sentence(main)
    return f"{prompt} {_KEEP_FR}" if profile.keep_clause else prompt


def _build_step(
    clause: str, profile: ModelProfile, english_input: bool, reference: str = ""
) -> tuple[PromptStep, bool]:
    """Construit le prompt d'UNE modification pour un modele donne."""
    window, clause = timecodes.extract(clause)
    if reference:
        profile = replace(profile, reference_en=reference, reference_fr=reference)
    intent = triage.resolve_intent(clause)
    raw_parts = triage.extract_parts(clause, intent)
    parts, complete = _translate_parts(raw_parts, english_input)
    if complete:
        prompt, negative = _english_prompt(intent, parts, profile)
    else:
        prompt, negative = _french_prompt(intent, raw_parts, profile), ""
    if len(prompt) > profile.max_chars:
        prompt = prompt[: profile.max_chars].rsplit(" ", 1)[0]
    step = PromptStep(
        intent=intent,
        prompt=prompt,
        negative_prompt=negative,
        timing=_timing(window),
        instruction=clause,
    )
    return step, complete


def recommended_params(model: str, intent: str) -> dict:
    """Parametres d'appel conseilles pour le modele et l'intention."""
    if model == "kling":
        reference = intent in {"next_shot", "previous_shot"}
        return {
            "model_name": "kling-video-o1",
            "refer_type": "feature" if reference else "base",
            "keep_original_sound": "yes",
        }
    if model == "luma":
        strength = {
            "restyle": "flex",
            "relight": "flex",
            "weather": "flex",
            "background": "reimagine",
            "angle": "reimagine",
            "next_shot": "reimagine",
            "previous_shot": "reimagine",
        }.get(intent, "adhere")
        return {"type": "video_edit", "model": "ray-3.2", "strength": strength}
    if model == "runway":
        return {"model": "aleph2"}
    if model == "seedance":
        return {"mode": "edit"}
    return {}


def enhance_with_rules(text: str, model: str = "kling", reference: str = "") -> PromptResult:
    """Ameliore un prompt par regles (hors ligne, deterministe).

    ``reference`` remplace la reference de la video propre au modele (ex.
    ``@Video1`` pour Kling via fal.ai au lieu de ``<<<video_1>>>``).
    """
    profile = _profile(model)
    model = profile.key
    english_input = lexicon.looks_english(text)
    clauses = triage.split_edits(text) or [triage.clean(text)]

    built = [_build_step(clause, profile, english_input, reference) for clause in clauses]
    translated = all(complete for _, complete in built)
    if not translated:
        # Une seule langue pour toutes les etapes : on reconstruit en francais.
        built = [_build_step(clause, profile, False, reference) for clause in clauses]
    steps = [step for step, _ in built]
    first = steps[0]
    language = "en" if translated else "fr"

    tips = list(profile.tips) + list(_COMMON_TIPS)
    if len(steps) > 1:
        tips.insert(0, _MULTI_EDIT_TIP)
    if not translated:
        tips.insert(0, _UNTRANSLATED_TIP)

    return PromptResult(
        original=text,
        enhanced=first.prompt,
        intent=first.intent,
        model=model,
        keep=_keep_sentence_en(first.intent) if language == "en" else _KEEP_FR,
        tips=tips,
        source="rules",
        language=language,
        negative_prompt=first.negative_prompt,
        steps=steps,
        params=recommended_params(model, first.intent),
        translated=translated,
    )


# --- Mode LLM -------------------------------------------------------------------
#
# Le LLM ne part pas d'une page blanche : il recoit le TRI deterministe de la
# demande (modifications, moments, intentions, jargon detecte) et le brouillon
# par regles. Son role se limite a la reformulation fine ; la structure, les
# moments et la reference de la video sont garantis par le code.

_LLM_SYSTEM = (
    "You are a senior film VFX supervisor and prompt engineer for AI video-to-video "
    "editing models. Convert the user's request (often French, sometimes vague) into "
    "production-ready English prompts for the target model.\n"
    "Target model: {label}.\nModel guide: {guide}\n"
    "Rules:\n"
    "- Exactly one prompt per edit listed in the triage, same order. Do not merge or add edits.\n"
    "- Never mention timecodes: timing is handled by the editing pipeline.\n"
    "- Be concrete and cinematic: subject, appearance (materials, colors with finish), "
    "position in frame, action, lighting integration; 25 to 60 words per prompt.\n"
    "- {keep_rule}\n"
    "{reference_rule}"
    "{glossary}"
    "Example: request « à 3 s ajoute un chevalier en armure qui traverse le champ » -> "
    '{{"prompts": ["Add a medieval knight in weathered steel plate armor walking across '
    "the field from left to right in {example_ref}, lit by the same soft overcast light, "
    "with matching shadows and film grain. Keep the camera framing and background "
    'unchanged."], "negative_prompt": "extra limbs, morphing armor, flicker"}}\n'
    'Answer ONLY with JSON: {{"prompts": ["..."], "negative_prompt": "..."}}'
)

_llm_cache = TTLCache(default_ttl=600.0, max_size=256)


def _llm_system(profile: ModelProfile, analysis: triage.Triage) -> str:
    keep_rule = (
        "State explicitly what must stay unchanged (identity, pose, motion, camera, lighting)."
        if profile.keep_clause
        else "Do not add a 'keep unchanged' sentence: this model preserves structure itself."
    )
    reference = profile.reference_en
    explicit = reference.startswith(("<<<", "@"))
    reference_rule = f"- Refer to the source video exactly as {reference}.\n" if explicit else ""
    terms = [
        term for term in cinema.TERMS if term.french in {t["french"] for t in analysis.cinema_terms}
    ]
    return _LLM_SYSTEM.format(
        label=profile.label,
        guide=profile.guide,
        keep_rule=keep_rule,
        reference_rule=reference_rule,
        glossary=cinema.glossary_for_llm(terms),
        example_ref=reference if explicit else "the video",
    )


def _llm_user(text: str, analysis: triage.Triage, draft: PromptResult) -> str:
    edits = [
        {"edit": index + 1, "instruction": edit.instruction, "intent": edit.intent}
        for index, edit in enumerate(analysis.edits)
    ]
    return (
        f"Request: {text}\n"
        f"Triage (authoritative list of edits): {json.dumps(edits, ensure_ascii=False)}\n"
        f"Rule-based draft (improve wording, fix translation mistakes): "
        f"{json.dumps([step.prompt for step in draft.steps], ensure_ascii=False)}"
    )


def _parse_llm_answer(content: str) -> tuple[list[str], str]:
    """Extrait ``prompts`` et ``negative_prompt`` d'une reponse LLM (JSON tolerant)."""
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
    content = re.sub(
        r"<think>.*?</think>", "", content, flags=re.S | re.I
    )  # modeles de raisonnement
    match = re.search(r"\{.*\}", content, re.S)
    if match:
        try:
            data = json.loads(match.group(0))
        except ValueError:
            data = None
        if isinstance(data, dict):
            prompts = data.get("prompts") or ([data["prompt"]] if data.get("prompt") else [])
            cleaned = [str(item).strip() for item in prompts if str(item).strip()]
            return cleaned, str(data.get("negative_prompt", "") or "").strip()
    plain = content.strip().strip('"').strip()
    return ([plain] if plain else []), ""


def _ensure_reference(prompt: str, profile: ModelProfile) -> str:
    """Garantit la reference de la video exigee par le modele (``<<<video_1>>>``, ``@Video1``)."""
    reference = profile.reference_en
    if not reference.startswith(("<<<", "@")) or reference in prompt:
        return prompt
    replaced, count = re.subn(r"\bthe (?:source )?video\b", reference, prompt, count=1, flags=re.I)
    return replaced if count else f"In {reference}, {prompt[0].lower()}{prompt[1:]}"


def _llm_steps(content: str, profile: ModelProfile, draft: PromptResult) -> list[PromptStep]:
    """Transforme la reponse du LLM en etapes validees (reference, longueur, moments)."""
    prompts, negative = _parse_llm_answer(content)
    if not prompts:
        return []
    if len(prompts) != len(draft.steps):
        # Le LLM n'a pas respecte le tri : on garde la structure fiable des regles.
        logger.info(
            "Réponse LLM incohérente (%d prompts pour %d modifications)",
            len(prompts),
            len(draft.steps),
        )
        return []
    negative = (negative or draft.negative_prompt) if profile.negative else ""
    return [
        PromptStep(
            intent=step.intent,
            prompt=_ensure_reference(prompt, profile)[: profile.max_chars],
            negative_prompt=negative,
            timing=step.timing,
            instruction=step.instruction,
        )
        for step, prompt in zip(draft.steps, prompts, strict=True)
    ]


async def _ask_llm(text: str, profile: ModelProfile, draft: PromptResult) -> tuple[str, str] | None:
    """Interroge un fournisseur texte gratuit ; retourne (fournisseur, texte) ou None."""
    from server.proxy import Capability, GenerationRequest, ProviderError, get_router

    analysis = triage.analyze(text)
    try:
        result = await get_router().submit(
            GenerationRequest(
                capability=Capability.TEXT,
                prompt=_llm_user(text, analysis, draft),
                options={
                    "system": _llm_system(profile, analysis),
                    "temperature": 0.3,
                    "max_tokens": 900,
                },
            )
        )
    except ProviderError as exc:
        logger.info("Amelioration LLM indisponible (%s) : repli sur les regles", exc.message)
        return None
    return result.provider, str(result.payload.get("text", ""))


async def enhance_with_llm(
    text: str, model: str = "kling", reference: str = ""
) -> PromptResult | None:
    """Ameliore un prompt via un fournisseur texte gratuit, ou None si indisponible."""
    profile = _profile(model)
    if reference:
        profile = replace(profile, reference_en=reference, reference_fr=reference)
    cache_key = f"{profile.key}|{profile.reference_en}|{text}"
    cached = _llm_cache.get(cache_key)
    if cached is not None:
        return cached

    draft = enhance_with_rules(text, profile.key, reference)
    answer = await _ask_llm(text, profile, draft)
    if answer is None:
        return None
    provider, content = answer
    steps = _llm_steps(content, profile, draft)
    if not steps:
        return None
    enhanced = PromptResult(
        original=text,
        enhanced=steps[0].prompt,
        intent=draft.intent,
        model=profile.key,
        keep=_keep_sentence_en(draft.intent),
        tips=[tip for tip in draft.tips if tip != _UNTRANSLATED_TIP],
        source=f"llm:{provider}",
        language="en",
        negative_prompt=steps[0].negative_prompt,
        steps=steps,
        params=draft.params,
        translated=True,
    )
    _llm_cache.set(cache_key, enhanced)
    return enhanced


async def enhance(
    text: str, model: str = "kling", use_llm: bool = False, reference: str = ""
) -> PromptResult:
    """Ameliore un prompt : via LLM si demande et disponible, sinon par regles."""
    if use_llm:
        result = await enhance_with_llm(text, model, reference)
        if result is not None:
            return result
    return enhance_with_rules(text, model, reference)


def is_engineered(text: str) -> bool:
    """Indique si le prompt est deja structure (reference Kling explicite)."""
    return "<<<video_" in text or "<<<image_" in text


def as_dict(result: PromptResult) -> dict:
    """Convertit un resultat en dictionnaire serialisable."""
    return asdict(result)
