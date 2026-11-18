"""Dépendances FastAPI : unité de travail par requête, utilisateur courant, services."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request

from goldfx.application.auth import AuthService
from goldfx.application.generation import GenerationService
from goldfx.application.media import MediaService
from goldfx.application.processing import ProcessingService
from goldfx.application.transcoding import TranscodingService
from goldfx.application.workflows import WorkflowService
from goldfx.container import Container
from goldfx.domain.errors import AuthenticationError
from goldfx.domain.models import User
from goldfx.domain.ports import UnitOfWork

SESSION_COOKIE = "goldfx_session"
CSRF_COOKIE = "goldfx_csrf"
CSRF_HEADER = "X-CSRF-Token"


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


ContainerDep = Annotated[Container, Depends(get_container)]


def get_uow(container: ContainerDep) -> Iterator[UnitOfWork]:
    uow, session = container.new_unit_of_work()
    try:
        yield uow
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


UowDep = Annotated[UnitOfWork, Depends(get_uow)]


def get_auth_service(container: ContainerDep, uow: UowDep) -> AuthService:
    return container.auth_service(uow)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_current_user(request: Request, auth: AuthServiceDep) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise AuthenticationError("Authentification requise")
    return auth.resolve(token)


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_media_service(container: ContainerDep, uow: UowDep) -> MediaService:
    return container.media_service(uow)


def get_processing_service(container: ContainerDep, uow: UowDep) -> ProcessingService:
    return container.processing_service(uow)


def get_generation_service(container: ContainerDep, uow: UowDep) -> GenerationService:
    return container.generation_service(uow)


def get_transcoding_service(container: ContainerDep, uow: UowDep) -> TranscodingService:
    return container.transcoding_service(uow)


def get_workflow_service(container: ContainerDep, uow: UowDep) -> WorkflowService:
    return container.workflow_service(uow)


MediaServiceDep = Annotated[MediaService, Depends(get_media_service)]
WorkflowServiceDep = Annotated[WorkflowService, Depends(get_workflow_service)]
ProcessingServiceDep = Annotated[ProcessingService, Depends(get_processing_service)]
GenerationServiceDep = Annotated[GenerationService, Depends(get_generation_service)]
TranscodingServiceDep = Annotated[TranscodingService, Depends(get_transcoding_service)]


def client_key(request: Request) -> str:
    """Identifiant client pour la limitation de débit (IP réelle derrière le proxy,
    uvicorn étant lancé avec ``--proxy-headers``)."""
    return request.client.host if request.client else "unknown"
