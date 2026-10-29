"""Routes du proxy multi-fournisseurs (LLM / generation).

Namespace **distinct** de ``/kling/*`` : la partie existante n'est pas modifiee.
Ces routes passent par le routeur (``server.llm``) qui choisit le fournisseur
selon la capacite, les quotas, la priorite et la coherence des taches.
"""

import logging
from dataclasses import asdict

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ..deps import require_user
from ..llm import Capability, GenerationRequest, ProviderError, get_router
from ..schemas import LLMGenerateRequest

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/api/llm", tags=["llm"], dependencies=[Depends(require_user)])


@router.get("/providers")
async def list_providers():
    """Liste les fournisseurs disponibles, leur etat et leur quota restant."""
    return {"providers": await get_router().describe()}


@router.post("/generate")
async def generate(payload: LLMGenerateRequest):
    """Route une demande de generation vers le fournisseur le plus adapte."""
    llm = get_router()
    request = GenerationRequest(
        capability=Capability(payload.capability),
        prompt=payload.prompt,
        options=payload.options,
    )
    try:
        result = await llm.submit(request)
    except ProviderError as exc:
        return JSONResponse({"error": exc.message, "message": exc.message}, status_code=502)
    return asdict(result)


@router.get("/status/{task_id}")
async def task_status(task_id: str):
    """Retourne l'etat d'une tache (chez le fournisseur qui l'a creee)."""
    llm = get_router()
    try:
        result = await llm.status(task_id)
    except ProviderError as exc:
        return JSONResponse({"error": exc.message, "message": exc.message}, status_code=502)
    return asdict(result)
