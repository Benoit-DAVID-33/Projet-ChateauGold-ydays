"""Routes du prompt engineering video-to-video (``/api/prompt``).

- ``POST /triage`` : tri deterministe (modifications, moments, intentions, jargon) ;
- ``POST /enhance`` : prompt(s) pour un modele cible (regles ou LLM gratuit) ;
- ``POST /chat`` : assistant conversationnel (reponse + modifications datees) ;
- ``GET /models`` : fiches de prompt par modele.
"""

import logging

from fastapi import APIRouter, Depends

from server.api.schemas import PromptChatRequest, PromptEnhanceRequest, TriageRequest
from server.core.auth_deps import require_user
from server.prompts import chat, enhancer, triage

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/api/prompt", tags=["prompt"], dependencies=[Depends(require_user)])


@router.get("/models")
async def list_models():
    """Modeles cibles supportes par le convertisseur de prompts (cle, libelle, conseils)."""
    return {
        "models": [
            {"key": profile.key, "label": profile.label, "tips": list(profile.tips)}
            for profile in enhancer.PROFILES.values()
        ]
    }


@router.post("/enhance")
async def enhance_prompt(payload: PromptEnhanceRequest):
    """Ameliore un prompt utilisateur pour un modele video-to-video."""
    result = await enhancer.enhance(payload.text, model=payload.model, use_llm=payload.use_llm)
    return enhancer.as_dict(result)


@router.post("/triage")
async def triage_request(payload: TriageRequest):
    """Tri de la demande avant tout prompt engineering (sans LLM, sans reseau)."""
    return triage.analyze(payload.text).as_dict()


@router.post("/chat")
async def chat_reply(payload: PromptChatRequest):
    """Assistant de prompt : repond et propose des modifications datees."""
    messages = [chat.ChatMessage(turn.role, turn.content) for turn in payload.messages]
    result = await chat.reply(messages, model=payload.model, use_llm=payload.use_llm)
    return result.as_dict()
