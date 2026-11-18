"""Entités du domaine.

Ce module ne dépend d'AUCUN framework (ni FastAPI, ni SQLAlchemy) : il décrit le
métier. Les couches externes convertissent leurs propres objets vers/depuis ces
entités.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class MediaKind(StrEnum):
    IMAGE = "image"
    VIDEO = "video"


class MediaSource(StrEnum):
    """Origine d'un média : permet de distinguer l'original de ses dérivés."""

    UPLOAD = "upload"
    PROCESSED = "processed"  # renvoyé par le service de traitement externe
    GENERATED = "generated"  # produit par Kling
    EXPORT = "export"  # export de l'éditeur (image annotée, vidéo MP4…)


class GenerationKind(StrEnum):
    TEXT_TO_IMAGE = "text_to_image"
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    OMNI_VIDEO = "omni_video"


class GenerationStatus(StrEnum):
    SUBMITTED = "submitted"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"

    @property
    def is_final(self) -> bool:
        return self in (GenerationStatus.SUCCEEDED, GenerationStatus.FAILED)


@dataclass(slots=True)
class User:
    id: UUID
    username: str
    email: str
    password_hash: str
    created_at: datetime
    is_active: bool = True


@dataclass(slots=True)
class Media:
    id: UUID
    owner_id: UUID
    kind: MediaKind
    source: MediaSource
    original_name: str
    storage_key: str
    content_type: str
    size_bytes: int
    created_at: datetime
    parent_id: UUID | None = None


@dataclass(slots=True)
class Generation:
    """Tâche de génération confiée à un fournisseur (Kling)."""

    id: UUID
    owner_id: UUID
    kind: GenerationKind
    status: GenerationStatus
    prompt: str
    parameters: dict[str, object]
    provider_task_id: str
    created_at: datetime
    updated_at: datetime
    source_media_id: UUID | None = None
    error_message: str | None = None
    result_media_ids: list[UUID] = field(default_factory=list)


@dataclass(slots=True)
class Session:
    """Session d'authentification (jeton opaque, seul son hash est stocké)."""

    token_hash: str
    user_id: UUID
    created_at: datetime
    expires_at: datetime


@dataclass(slots=True)
class Workflow:
    """Graphe de traitement (onglet Workflow, façon ComfyUI) enregistré par un utilisateur.

    Le graphe est un document JSON versionné ; son interprétation (types de nœuds,
    exécution) appartient au frontend. Le backend en garantit la propriété,
    la taille et la structure minimale.
    """

    id: UUID
    owner_id: UUID
    name: str
    graph: dict[str, object]
    created_at: datetime
    updated_at: datetime
