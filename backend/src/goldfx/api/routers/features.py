"""Recherche, génération IA, conversion vidéo et contact."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, Response

from goldfx.api.deps import (
    ContainerDep,
    CurrentUser,
    GenerationServiceDep,
    ProcessingServiceDep,
    TranscodingServiceDep,
)
from goldfx.api.schemas import (
    ContactIn,
    GenerationIn,
    GenerationOut,
    MediaOut,
    ProviderHealthOut,
    SearchIn,
    SearchOut,
)
from goldfx.application.generation import GenerationInput

router = APIRouter(prefix="/api", tags=["features"])


# --------------------------------------------------------------------------- #
# Recherche (barre « Comment puis-je vous aider ? »)
# --------------------------------------------------------------------------- #
@router.post("/search", response_model=SearchOut)
def search(payload: SearchIn, user: CurrentUser, service: ProcessingServiceDep) -> SearchOut:
    result = service.search(user.id, payload.query, payload.media_id)
    return SearchOut(
        query=result.query,
        response=result.answer.response if result.answer else None,
        timestamp=result.answer.timestamp if result.answer else None,
        processed_media=MediaOut.of(result.processed_media) if result.processed_media else None,
    )


# --------------------------------------------------------------------------- #
# Génération IA
# --------------------------------------------------------------------------- #
@router.post("/generations", response_model=GenerationOut, status_code=status.HTTP_201_CREATED)
def create_generation(
    payload: GenerationIn, user: CurrentUser, service: GenerationServiceDep
) -> GenerationOut:
    generation = service.create(user.id, GenerationInput(**payload.model_dump()))
    return GenerationOut.of(generation)


@router.get("/generations", response_model=list[GenerationOut])
def list_generations(
    user: CurrentUser,
    service: GenerationServiceDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    source_media_id: Annotated[
        UUID | None, Query(description="Générations faites à partir de ce média seulement")
    ] = None,
) -> list[GenerationOut]:
    generations = service.list_owned(user.id, limit, offset, source_media_id)
    return [GenerationOut.of(g) for g in generations]


@router.get("/generations/provider/health", response_model=ProviderHealthOut)
def provider_health(user: CurrentUser, service: GenerationServiceDep) -> ProviderHealthOut:
    """Teste la connexion au fournisseur (Kling) sans consommer de crédits."""
    health = service.check_provider()
    return ProviderHealthOut(ok=health.ok, message=health.message)


@router.get("/generations/{generation_id}", response_model=GenerationOut)
def get_generation(
    generation_id: UUID, user: CurrentUser, service: GenerationServiceDep
) -> GenerationOut:
    """Statut à jour (interroge le fournisseur tant que la tâche n'est pas finie)."""
    return GenerationOut.of(service.refresh(user.id, generation_id))


# --------------------------------------------------------------------------- #
# Conversion WebM vers MP4 (export de la vidéo annotée)
# --------------------------------------------------------------------------- #
@router.post(
    "/transcode/webm-to-mp4",
    response_class=FileResponse,
    responses={201: {"model": MediaOut}, 200: {"content": {"video/mp4": {}}}},
)
def webm_to_mp4(
    user: CurrentUser,
    service: TranscodingServiceDep,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File(description="Enregistrement WebM")],
    save_to_library: Annotated[bool, Form()] = False,
    parent_id: Annotated[UUID | None, Form()] = None,
) -> Response:
    if save_to_library:
        media = service.webm_to_mp4_in_library(user.id, file.file, parent_id)
        return JSONResponse(
            MediaOut.of(media).model_dump(mode="json"), status_code=status.HTTP_201_CREATED
        )
    result = service.webm_to_mp4(file.file)
    background.add_task(result.cleanup)
    return FileResponse(
        result.path,
        media_type="video/mp4",
        filename=result.download_name,
        background=background,
    )


# --------------------------------------------------------------------------- #
# Contact
# --------------------------------------------------------------------------- #
@router.post("/contact", status_code=status.HTTP_202_ACCEPTED)
def contact(payload: ContactIn, user: CurrentUser, container: ContainerDep) -> dict[str, str]:
    container.contact_service().send(user, payload.name, str(payload.email), payload.message)
    return {"status": "sent"}
