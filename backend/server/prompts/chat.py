"""Chatbot de prompt : un assistant de plateau qui transforme une idee en montage.

L'assistant repond a la conversation en trois blocs :

- ``reply`` : message en francais (reformulation, conseils de realisation) ;
- ``edits`` : modifications datees prêtes a envoyer dans la timeline ;
- ``questions`` : ce qu'il manque pour un resultat net.

Avec un LLM **gratuit** disponible (voir ``server.proxy``), la reponse est
redigee par le modele a partir du tri deterministe ; sinon une reponse par
regles est construite (toujours disponible, hors ligne).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field

from server.prompts import enhancer, triage

logger = logging.getLogger("goldfx")

MAX_HISTORY = 12


@dataclass(frozen=True)
class ChatMessage:
    """Un message de la conversation."""

    role: str  # user | assistant
    content: str


@dataclass
class ChatReply:
    """Reponse de l'assistant."""

    reply: str
    edits: list[dict] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    cinema_terms: list[dict] = field(default_factory=list)
    source: str = "rules"

    def as_dict(self) -> dict:
        """Representation JSON."""
        return asdict(self)


_INTENT_FR = {
    "add": "ajout",
    "remove": "retrait",
    "replace": "remplacement",
    "recolor": "changement de couleur",
    "restyle": "changement de style",
    "background": "changement de décor",
    "weather": "météo / moment de la journée",
    "relight": "éclairage",
    "angle": "cadrage",
    "next_shot": "plan suivant",
    "previous_shot": "plan précédent",
    "generic": "modification à préciser",
}


def _timing_label(timing: dict) -> str:
    if not timing:
        return "toute la vidéo"
    if timing.get("anchor") == "end":
        return "fin de la vidéo"
    start = timing.get("start", 0)
    if "end" in timing:
        return f"{start:g} → {timing['end']:g} s"
    if "length" in timing:
        return f"{start:g} → {start + timing['length']:g} s"
    return f"à partir de {start:g} s"


def _rules_reply(text: str, model: str) -> ChatReply:
    analysis = triage.analyze(text)
    result = enhancer.enhance_with_rules(text, model)
    edits: list[dict] = [
        {
            "instruction": edit.instruction,
            "intent": edit.intent,
            "timing": edit.timing,
            "prompt": step.prompt,
        }
        for edit, step in zip(analysis.edits, result.steps, strict=False)
    ]
    lines = [f"J'ai compris {len(edits)} modification(s) :"]
    lines += [
        f"{index}. {_INTENT_FR.get(edit.intent, edit.intent)} — « {edit.instruction} » "
        f"({_timing_label(edit.timing)})"
        for index, edit in enumerate(analysis.edits, start=1)
    ]
    if analysis.cinema_terms:
        lines.append(
            "Vocabulaire de tournage repéré : "
            + ", ".join(f"{t['french']} → {t['english']}" for t in analysis.cinema_terms)
        )
    lines.append("Les prompts sont prêts : ajoutez-les à la timeline puis lancez l'aperçu du plan.")
    return ChatReply(
        reply="\n".join(lines),
        edits=edits,
        questions=analysis.questions,
        cinema_terms=analysis.cinema_terms,
        source="rules",
    )


_SYSTEM = (
    "Tu es l'assistant de plateau de GOLD FX, un studio d'édition vidéo par IA pour le cinéma. "
    "Tu aides un monteur ou un amateur à formuler des modifications de SA vidéo. "
    "Réponds en français, de façon concise et concrète (mise en scène, lumière, raccords). "
    "Utilise le tri fourni (modifications, moments) comme vérité : ne change pas les moments. "
    "Pour chaque modification, rédige un prompt anglais prêt pour un modèle vidéo "
    "(sujet, apparence, position, action, intégration lumière). "
    "Pose au plus 2 questions si une information indispensable manque. "
    'Réponds UNIQUEMENT en JSON : {"reply": "...", "prompts": ["..."], "questions": ["..."]}'
)


def _parse(content: str) -> dict | None:
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.S | re.I)
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return None
    return data if isinstance(data, dict) and data.get("reply") else None


async def reply(
    messages: list[ChatMessage], model: str = "kling", use_llm: bool = True
) -> ChatReply:
    """Repond a la conversation (LLM gratuit si disponible, sinon regles)."""
    history = [m for m in messages if m.role in {"user", "assistant"}][-MAX_HISTORY:]
    last_user = next((m.content for m in reversed(history) if m.role == "user"), "").strip()
    if not last_user:
        return ChatReply(
            reply="Décrivez ce que vous voulez changer dans votre vidéo, avec les moments si "
            "besoin (ex. « à 2 s intègre un chevalier, puis à 15 s ajoute un dragon »)."
        )
    base = _rules_reply(last_user, model)
    if not use_llm:
        return base

    return await _llm_reply(history, base)


async def _llm_reply(history: list[ChatMessage], base: ChatReply) -> ChatReply:
    """Reponse redigee par un LLM gratuit a partir du tri (repli : ``base``)."""
    from server.proxy import Capability, GenerationRequest, ProviderError, get_router

    transcript = "\n".join(f"{m.role}: {m.content}" for m in history)
    triage_json = json.dumps(
        [{"instruction": e["instruction"], "timing": e["timing"]} for e in base.edits],
        ensure_ascii=False,
    )
    try:
        result = await get_router().submit(
            GenerationRequest(
                capability=Capability.TEXT,
                prompt=f"Conversation:\n{transcript}\n\nTri de la dernière demande : {triage_json}",
                options={"system": _SYSTEM, "temperature": 0.4, "max_tokens": 900},
            )
        )
    except ProviderError as exc:
        logger.info("Chatbot : LLM indisponible (%s), réponse par règles", exc.message)
        return base

    data = _parse(str(result.payload.get("text", "")))
    if data is None:
        return base
    prompts = [str(p).strip() for p in data.get("prompts", []) if str(p).strip()]
    edits = base.edits
    if len(prompts) == len(edits):
        edits = [{**edit, "prompt": prompt} for edit, prompt in zip(edits, prompts, strict=True)]
    questions = [str(q) for q in data.get("questions", [])][:2] or base.questions
    return ChatReply(
        reply=str(data["reply"]),
        edits=edits,
        questions=questions,
        cinema_terms=base.cinema_terms,
        source=f"llm:{result.provider}",
    )
