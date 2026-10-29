"""Routes d'amelioration de prompt (prompt engineering video-to-video).

Transforme une demande naturelle en prompt structure pour un modele cible.
Le mode « regles » fonctionne hors ligne ; le mode « LLM » utilise un
fournisseur texte s'il est configure (repli automatique sur les regles).
"""

import logging

from fastapi import APIRouter, Depends

from .. import prompting
from ..deps import require_user
from ..schemas import PromptEnhanceRequest

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/api/prompt", tags=["prompt"], dependencies=[Depends(require_user)])


@router.post("/enhance")
async def enhance_prompt(payload: PromptEnhanceRequest):
    """Ameliore un prompt utilisateur pour un modele video-to-video."""
    result = await prompting.enhance(payload.text, model=payload.model, use_llm=payload.use_llm)
    return prompting.as_dict(result)
