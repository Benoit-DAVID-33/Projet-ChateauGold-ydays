"""Ports (interfaces) du domaine — principe d'inversion des dépendances (DIP).

Les services applicatifs ne dépendent que de ces abstractions. Les
implémentations concrètes vivent dans ``goldfx.infrastructure`` et sont
assemblées dans ``goldfx.container`` (composition root). Pour remplacer un
fournisseur (par exemple Kling par une autre API, ou le disque local par S3),
il suffit d'écrire un nouvel adaptateur respectant le port : aucun service
n'est modifié (OCP).

Les interfaces sont volontairement petites et ciblées (ISP).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import BinaryIO, Protocol
from uuid import UUID

from goldfx.domain.models import (
    Generation,
    GenerationKind,
    GenerationStatus,
    Media,
    MediaKind,
    Session,
    User,
    Workflow,
)

# --------------------------------------------------------------------------- #
# Temps
# --------------------------------------------------------------------------- #


class Clock(Protocol):
    def now(self) -> datetime:
        """Instant courant, toujours en UTC et « timezone-aware »."""
        ...


# --------------------------------------------------------------------------- #
# Persistance
# --------------------------------------------------------------------------- #


class UserRepository(Protocol):
    def get(self, user_id: UUID) -> User | None: ...
    def get_by_username(self, username: str) -> User | None: ...
    def get_by_email(self, email: str) -> User | None: ...
    def add(self, user: User) -> None: ...
    def update_password_hash(self, user_id: UUID, password_hash: str) -> None: ...


class SessionRepository(Protocol):
    def add(self, session: Session) -> None: ...
    def get(self, token_hash: str) -> Session | None: ...
    def delete(self, token_hash: str) -> None: ...
    def delete_expired(self, now: datetime) -> int: ...


class MediaRepository(Protocol):
    def add(self, media: Media) -> None: ...
    def get(self, media_id: UUID) -> Media | None: ...
    def list_by_owner(
        self,
        owner_id: UUID,
        kind: MediaKind | None,
        limit: int,
        offset: int,
        parent_id: UUID | None = None,
    ) -> Sequence[Media]: ...
    def delete(self, media_id: UUID) -> None: ...


class GenerationRepository(Protocol):
    def add(self, generation: Generation) -> None: ...
    def get(self, generation_id: UUID) -> Generation | None: ...
    def update(self, generation: Generation) -> None:
        """Enregistre l'état et libère le bail de suivi."""
        ...

    def list_by_owner(
        self, owner_id: UUID, limit: int, offset: int, source_media_id: UUID | None = None
    ) -> Sequence[Generation]: ...
    def list_pending(self, now: datetime, limit: int) -> Sequence[Generation]:
        """Générations non terminées sans bail en cours, les moins récemment suivies d'abord."""
        ...

    def try_lease(self, generation_id: UUID, now: datetime, until: datetime) -> bool:
        """Prend le bail de suivi (opération atomique) ; False s'il est déjà tenu."""
        ...

    def release_lease(self, generation_id: UUID) -> None: ...


class WorkflowRepository(Protocol):
    def add(self, workflow: Workflow) -> None: ...
    def get(self, workflow_id: UUID) -> Workflow | None: ...
    def update(self, workflow: Workflow) -> None: ...
    def delete(self, workflow_id: UUID) -> None: ...
    def list_by_owner(self, owner_id: UUID, limit: int, offset: int) -> Sequence[Workflow]: ...


class UnitOfWork(Protocol):
    """Regroupe les dépôts d'une même transaction."""

    # Propriétés en lecture seule : covariance (une implémentation peut exposer
    # un sous-type concret du dépôt).
    @property
    def users(self) -> UserRepository: ...
    @property
    def sessions(self) -> SessionRepository: ...
    @property
    def media(self) -> MediaRepository: ...
    @property
    def generations(self) -> GenerationRepository: ...
    @property
    def workflows(self) -> WorkflowRepository: ...

    def commit(self) -> None: ...
    def rollback(self) -> None: ...


# --------------------------------------------------------------------------- #
# Sécurité
# --------------------------------------------------------------------------- #


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...
    def verify(self, password_hash: str, password: str) -> bool: ...
    def needs_rehash(self, password_hash: str) -> bool: ...


class UrlSigner(Protocol):
    """Signe un identifiant pour un accès public temporaire (ex. Kling)."""

    def sign(self, value: str, expires_at: datetime) -> str: ...
    def unsign(self, token: str, now: datetime) -> str: ...


class RateLimiter(Protocol):
    def hit(self, key: str) -> bool:
        """Enregistre une tentative ; renvoie False si la limite est dépassée."""
        ...

    def reset(self, key: str) -> None: ...


# --------------------------------------------------------------------------- #
# Fichiers
# --------------------------------------------------------------------------- #


class FileStorage(Protocol):
    def save(self, key: str, source: BinaryIO, max_bytes: int) -> int:
        """Copie le flux ; lève ``PayloadTooLargeError`` au-delà de ``max_bytes``."""
        ...

    def save_bytes(self, key: str, data: bytes) -> int: ...
    def open(self, key: str) -> BinaryIO: ...
    def local_path(self, key: str) -> Path: ...
    def delete(self, key: str) -> None: ...


@dataclass(frozen=True, slots=True)
class DetectedType:
    kind: MediaKind
    content_type: str
    extension: str


class MediaTypeDetector(Protocol):
    """Identifie le type réel d'un fichier à partir de son contenu (pas de son nom)."""

    def detect(self, header: bytes) -> DetectedType | None: ...


# --------------------------------------------------------------------------- #
# Services externes
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class ProcessedMedia:
    data: bytes
    content_type: str


@dataclass(frozen=True, slots=True)
class QueryAnswer:
    response: str
    timestamp: datetime


class MediaProcessor(Protocol):
    """Service de traitement de médias / requêtes texte (API externe)."""

    def process_media(
        self, data: BinaryIO, filename: str, content_type: str, query: str
    ) -> ProcessedMedia: ...

    def process_query(self, query: str) -> QueryAnswer: ...


class VideoTranscoder(Protocol):
    def to_mp4(self, source: Path, destination: Path) -> None: ...


@dataclass(frozen=True, slots=True)
class EmailMessage:
    to: str
    subject: str
    body: str
    reply_to: str | None = None


class Mailer(Protocol):
    def send(self, message: EmailMessage) -> None: ...


@dataclass(frozen=True, slots=True)
class GenerationRequest:
    kind: GenerationKind
    prompt: str
    negative_prompt: str = ""
    aspect_ratio: str | None = None
    duration: str = "5"
    mode: str = "std"
    count: int = 1
    image_base64: str | None = None
    video_url: str | None = None
    refer_type: str = "base"
    keep_original_sound: bool = True


@dataclass(frozen=True, slots=True)
class ProviderTaskState:
    status: GenerationStatus
    result_urls: list[str] = field(default_factory=list)
    error_message: str | None = None


@dataclass(frozen=True, slots=True)
class ProviderHealth:
    ok: bool
    message: str


class GenerationProvider(Protocol):
    """Fournisseur de génération IA (implémentation actuelle : Kling AI)."""

    def submit(self, request: GenerationRequest) -> str:
        """Soumet la tâche et renvoie l'identifiant côté fournisseur."""
        ...

    def get_state(self, kind: GenerationKind, task_id: str) -> ProviderTaskState: ...
    def download(self, url: str, max_bytes: int) -> tuple[bytes, str]: ...
    def check(self) -> ProviderHealth: ...
