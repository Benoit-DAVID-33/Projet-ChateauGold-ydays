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
    llm = get_router()
    health = await llm.health()
    remaining = llm.quota_remaining()
    return {
        "providers": [
            {
                "name": provider.name,
                "capabilities": sorted(capability.value for capability in provider.capabilities),
                "reachable": health.get(provider.name, False),
                "quota_remaining": remaining.get(provider.name),
            }
            for provider in llm.providers
        ]
    }


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
