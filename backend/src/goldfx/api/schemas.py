"""DTO de l'API (contrat public, exporté en OpenAPI pour le frontend)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from goldfx.domain.models import (
    Generation,
    GenerationKind,
    GenerationStatus,
    Media,
    MediaKind,
    MediaSource,
    User,
    Workflow,
)

Trimmed = Annotated[str, StringConstraints(strip_whitespace=True)]


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class RegisterIn(BaseModel):
    username: Annotated[Trimmed, StringConstraints(min_length=3, max_length=32)]
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=1024)]


class LoginIn(BaseModel):
    identifier: Annotated[Trimmed, StringConstraints(min_length=1, max_length=320)] = Field(
        description="Nom d'utilisateur ou email"
    )
    password: Annotated[str, StringConstraints(min_length=1, max_length=1024)]


class UserOut(_Out):
    id: UUID
    username: str
    email: str
    created_at: datetime

    @classmethod
    def of(cls, user: User) -> UserOut:
        return cls.model_validate(user)


class CsrfOut(BaseModel):
    csrf_token: str


# --------------------------------------------------------------------------- #
# Médias
# --------------------------------------------------------------------------- #
class MediaOut(_Out):
    id: UUID
    kind: MediaKind
    source: MediaSource
    name: str
    content_type: str
    size_bytes: int
    created_at: datetime
    parent_id: UUID | None
    content_url: str

    @classmethod
    def of(cls, media: Media) -> MediaOut:
        return cls(
            id=media.id,
            kind=media.kind,
            source=media.source,
            name=media.original_name,
            content_type=media.content_type,
            size_bytes=media.size_bytes,
            created_at=media.created_at,
            parent_id=media.parent_id,
            content_url=f"/api/media/{media.id}/content",
        )


class ProcessIn(BaseModel):
    query: Annotated[str, StringConstraints(max_length=4000)] = ""


# --------------------------------------------------------------------------- #
# Recherche / traitement de requête
# --------------------------------------------------------------------------- #
class SearchIn(BaseModel):
    query: Annotated[str, StringConstraints(max_length=4000)] = ""
    media_id: UUID | None = None


class SearchOut(BaseModel):
    query: str
    response: str | None
    timestamp: datetime | None
    processed_media: MediaOut | None


# --------------------------------------------------------------------------- #
# Génération (Kling)
# --------------------------------------------------------------------------- #
class GenerationIn(BaseModel):
    kind: GenerationKind
    prompt: Annotated[str, StringConstraints(max_length=2500)] = ""
    negative_prompt: Annotated[str, StringConstraints(max_length=2500)] = ""
    aspect_ratio: str | None = None
    duration: str = "5"
    mode: str = "std"
    count: int = Field(default=1, ge=1, le=9)
    source_media_id: UUID | None = None
    refer_type: str = "base"
    keep_original_sound: bool = True


class GenerationOut(_Out):
    id: UUID
    kind: GenerationKind
    status: GenerationStatus
    prompt: str
    parameters: dict[str, object]
    source_media_id: UUID | None
    error_message: str | None
    result_media_ids: list[UUID]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, generation: Generation) -> GenerationOut:
        return cls.model_validate(generation)


class ProviderHealthOut(BaseModel):
    ok: bool
    message: str


# --------------------------------------------------------------------------- #
# Contact
# --------------------------------------------------------------------------- #
class ContactIn(BaseModel):
    name: Annotated[Trimmed, StringConstraints(min_length=1, max_length=200)]
    email: EmailStr
    message: Annotated[Trimmed, StringConstraints(min_length=1, max_length=5000)]


class HealthOut(BaseModel):
    status: str
    version: str


# --------------------------------------------------------------------------- #
# Workflows (onglet à nœuds)
# --------------------------------------------------------------------------- #
class WorkflowIn(BaseModel):
    name: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    graph: dict[str, Any] = Field(description="Graphe versionné : {version, nodes, edges}")


class WorkflowSummaryOut(_Out):
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime


class WorkflowOut(WorkflowSummaryOut):
    graph: dict[str, Any]

    @classmethod
    def of(cls, workflow: Workflow) -> WorkflowOut:
        return cls.model_validate(workflow)
