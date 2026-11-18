"""Cas d'usage autour des médias de l'utilisateur (upload, bibliothèque, suppression)."""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import BinaryIO
from uuid import UUID

from goldfx.domain.errors import (
    NotFoundError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
    ValidationError,
)
from goldfx.domain.models import Media, MediaKind, MediaSource
from goldfx.domain.ports import Clock, DetectedType, FileStorage, MediaTypeDetector, UnitOfWork

logger = logging.getLogger(__name__)

_HEADER_SIZE = 64
_SAFE_NAME_RE = re.compile(r"[^\w.\- ()\[\]]+", re.UNICODE)


@dataclass(frozen=True, slots=True)
class MediaLimits:
    max_image_bytes: int
    max_video_bytes: int

    def for_kind(self, kind: MediaKind) -> int:
        return self.max_image_bytes if kind is MediaKind.IMAGE else self.max_video_bytes


def clean_display_name(filename: str | None, fallback: str) -> str:
    """Nom affichable : sans chemin, sans caractères exotiques, longueur bornée."""
    name = PurePath((filename or "").replace("\\", "/")).name.strip()
    name = _SAFE_NAME_RE.sub("_", name)[:200]
    return name or fallback


class MediaService:
    def __init__(
        self,
        uow: UnitOfWork,
        storage: FileStorage,
        detector: MediaTypeDetector,
        clock: Clock,
        limits: MediaLimits,
    ) -> None:
        self._uow = uow
        self._storage = storage
        self._detector = detector
        self._clock = clock
        self._limits = limits

    # ------------------------------------------------------------------ #
    # Écriture
    # ------------------------------------------------------------------ #
    def upload(self, owner_id: UUID, filename: str | None, stream: BinaryIO) -> Media:
        header = stream.read(_HEADER_SIZE)
        stream.seek(0)
        detected = self._detect(header)
        return self._store(
            owner_id=owner_id,
            detected=detected,
            display_name=clean_display_name(filename, f"media{detected.extension}"),
            source=MediaSource.UPLOAD,
            writer=lambda key: self._storage.save(
                key, stream, self._limits.for_kind(detected.kind)
            ),
        )

    def add_derived(
        self,
        owner_id: UUID,
        data: bytes,
        display_name: str,
        source: MediaSource,
        parent_id: UUID | None = None,
    ) -> Media:
        """Enregistre un média produit par l'application (traitement, Kling, export)."""
        detected = self._detect(data[:_HEADER_SIZE])
        if len(data) > self._limits.for_kind(detected.kind):
            raise PayloadTooLargeError("Le fichier produit dépasse la taille autorisée")
        name = clean_display_name(display_name, f"media{detected.extension}")
        if not name.lower().endswith(detected.extension):
            name = f"{Path(name).stem}{detected.extension}"
        return self._store(
            owner_id=owner_id,
            detected=detected,
            display_name=name,
            source=source,
            writer=lambda key: self._storage.save_bytes(key, data),
            parent_id=parent_id,
        )

    def add_derived_stream(
        self,
        owner_id: UUID,
        stream: BinaryIO,
        display_name: str,
        source: MediaSource,
        parent_id: UUID | None = None,
    ) -> Media:
        header = stream.read(_HEADER_SIZE)
        stream.seek(0)
        detected = self._detect(header)
        return self._store(
            owner_id=owner_id,
            detected=detected,
            display_name=clean_display_name(display_name, f"media{detected.extension}"),
            source=source,
            writer=lambda key: self._storage.save(
                key, stream, self._limits.for_kind(detected.kind)
            ),
            parent_id=parent_id,
        )

    def delete(self, owner_id: UUID, media_id: UUID) -> None:
        media = self.get(owner_id, media_id)
        self._uow.media.delete(media.id)
        self._uow.commit()
        # Le fichier est supprimé après la transaction : en cas d'échec de la
        # base, on ne perd pas le fichier d'un média encore référencé.
        self._storage.delete(media.storage_key)

    # ------------------------------------------------------------------ #
    # Lecture
    # ------------------------------------------------------------------ #
    def get(self, owner_id: UUID, media_id: UUID) -> Media:
        media = self._uow.media.get(media_id)
        # Un média d'un autre utilisateur est indiscernable d'un média absent.
        if media is None or media.owner_id != owner_id:
            raise NotFoundError("Média introuvable")
        return media

    def get_unchecked(self, media_id: UUID) -> Media:
        """Accès sans contrôle de propriétaire — réservé aux liens signés."""
        media = self._uow.media.get(media_id)
        if media is None:
            raise NotFoundError("Média introuvable")
        return media

    def list_owned(
        self,
        owner_id: UUID,
        kind: MediaKind | None = None,
        limit: int = 50,
        offset: int = 0,
        parent_id: UUID | None = None,
    ) -> Sequence[Media]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError("Pagination invalide")
        return self._uow.media.list_by_owner(owner_id, kind, limit, offset, parent_id)

    def path_of(self, media: Media) -> Path:
        return self._storage.local_path(media.storage_key)

    def read_bytes(self, media: Media) -> bytes:
        with self._storage.open(media.storage_key) as handle:
            return handle.read()

    def open(self, media: Media) -> BinaryIO:
        return self._storage.open(media.storage_key)

    # ------------------------------------------------------------------ #
    def _detect(self, header: bytes) -> DetectedType:
        if not header:
            raise ValidationError("Fichier vide")
        detected = self._detector.detect(header)
        if detected is None:
            raise UnsupportedMediaTypeError(
                "Format non supporté. Images : JPEG, PNG, GIF, WEBP, BMP. "
                "Vidéos : MP4, MOV, WEBM, MKV, AVI."
            )
        return detected

    def _store(
        self,
        owner_id: UUID,
        detected: DetectedType,
        display_name: str,
        source: MediaSource,
        writer: Callable[[str], int],
        parent_id: UUID | None = None,
    ) -> Media:
        media_id = uuid.uuid4()
        key = f"{owner_id}/{media_id}{detected.extension}"
        size = writer(key)
        media = Media(
            id=media_id,
            owner_id=owner_id,
            kind=detected.kind,
            source=source,
            original_name=display_name,
            storage_key=key,
            content_type=detected.content_type,
            size_bytes=size,
            created_at=self._clock.now(),
            parent_id=parent_id,
        )
        try:
            self._uow.media.add(media)
            self._uow.commit()
        except Exception:
            self._uow.rollback()
            self._storage.delete(key)
            raise
        logger.info("media.stored id=%s kind=%s size=%s", media.id, media.kind, size)
        return media
