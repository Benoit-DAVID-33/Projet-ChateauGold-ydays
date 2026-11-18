from __future__ import annotations

from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse

from goldfx.api.deps import ContainerDep, CurrentUser, MediaServiceDep, ProcessingServiceDep
from goldfx.api.schemas import MediaOut, ProcessIn
from goldfx.domain.errors import AuthenticationError
from goldfx.domain.models import Media, MediaKind, MediaSource

router = APIRouter(prefix="/api", tags=["media"])

# Un média servi ne doit jamais pouvoir exécuter de script, même mal typé.
_MEDIA_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"


def file_response(media: Media, path: str, download: bool) -> FileResponse:
    disposition = "attachment" if download else "inline"
    return FileResponse(
        path,
        media_type=media.content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(media.original_name)}",
            "Content-Security-Policy": _MEDIA_CSP,
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.post("/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
def upload_media(
    user: CurrentUser,
    service: MediaServiceDep,
    file: Annotated[UploadFile, File(description="Image ou vidéo")],
    parent_id: Annotated[UUID | None, Form()] = None,
    as_export: Annotated[bool, Form(description="Export de l'éditeur")] = False,
) -> MediaOut:
    """Upload d'un média, ou enregistrement d'un export de l'éditeur
    (``as_export`` + ``parent_id`` : image annotée rattachée à l'original)."""
    if as_export:
        if parent_id is not None:
            service.get(user.id, parent_id)  # contrôle de propriété
        media = service.add_derived_stream(
            owner_id=user.id,
            stream=file.file,
            display_name=file.filename or "export",
            source=MediaSource.EXPORT,
            parent_id=parent_id,
        )
    else:
        media = service.upload(user.id, file.filename, file.file)
    return MediaOut.of(media)


@router.get("/media", response_model=list[MediaOut])
def list_media(
    user: CurrentUser,
    service: MediaServiceDep,
    kind: MediaKind | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    parent_id: Annotated[UUID | None, Query(description="Dérivés de ce média seulement")] = None,
) -> list[MediaOut]:
    media = service.list_owned(user.id, kind, limit, offset, parent_id)
    return [MediaOut.of(m) for m in media]


@router.get("/media/{media_id}", response_model=MediaOut)
def get_media(media_id: UUID, user: CurrentUser, service: MediaServiceDep) -> MediaOut:
    return MediaOut.of(service.get(user.id, media_id))


@router.get("/media/{media_id}/content", response_class=FileResponse)
def media_content(
    media_id: UUID,
    user: CurrentUser,
    service: MediaServiceDep,
    download: bool = False,
) -> FileResponse:
    """Contenu binaire (gère les requêtes Range : lecture/avance rapide vidéo)."""
    media = service.get(user.id, media_id)
    return file_response(media, str(service.path_of(media)), download)


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(media_id: UUID, user: CurrentUser, service: MediaServiceDep) -> None:
    service.delete(user.id, media_id)


@router.post(
    "/media/{media_id}/process", response_model=MediaOut, status_code=status.HTTP_201_CREATED
)
def process_media(
    media_id: UUID, payload: ProcessIn, user: CurrentUser, service: ProcessingServiceDep
) -> MediaOut:
    """Envoie le média (+ texte facultatif) au service de traitement externe."""
    return MediaOut.of(service.process_media(user.id, media_id, payload.query))


@router.get("/public/media/{token}", response_class=FileResponse, include_in_schema=False)
def public_media(token: str, service: MediaServiceDep, container: ContainerDep) -> FileResponse:
    """Accès temporaire signé (ex. Kling télécharge la vidéo source d'Omni-Video)."""
    value = container.signer.unsign(token, container.clock.now())
    try:
        media_id = UUID(value)
    except ValueError as exc:
        raise AuthenticationError("Lien invalide") from exc
    media = service.get_unchecked(media_id)
    return file_response(media, str(service.path_of(media)), download=False)
