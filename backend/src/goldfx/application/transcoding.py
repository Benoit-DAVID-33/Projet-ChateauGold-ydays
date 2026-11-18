"""Conversion des enregistrements de l'éditeur (WebM) en MP4 lisible partout."""

from __future__ import annotations

import shutil
import tempfile
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from uuid import UUID

from goldfx.domain.errors import PayloadTooLargeError, RateLimitedError, ValidationError
from goldfx.domain.models import Media, MediaSource
from goldfx.domain.ports import VideoTranscoder

from .media import MediaService

_WEBM_MAGIC = b"\x1a\x45\xdf\xa3"
_CHUNK = 1024 * 1024


@dataclass(frozen=True, slots=True)
class TranscodeResult:
    path: Path
    workdir: Path
    download_name: str

    def cleanup(self) -> None:
        shutil.rmtree(self.workdir, ignore_errors=True)


class TranscodingService:
    def __init__(
        self,
        transcoder: VideoTranscoder,
        media: MediaService,
        max_bytes: int,
        slots: threading.BoundedSemaphore,
    ) -> None:
        # ``slots`` est partagé par toutes les requêtes : il borne le nombre de
        # conversions ffmpeg simultanées sur le serveur.
        self._transcoder = transcoder
        self._media = media
        self._max_bytes = max_bytes
        self._slots = slots

    def webm_to_mp4(self, source: BinaryIO) -> TranscodeResult:
        """Convertit un flux WebM ; l'appelant doit appeler ``cleanup()``."""
        workdir = Path(tempfile.mkdtemp(prefix="goldfx-transcode-"))
        try:
            src = workdir / "input.webm"
            self._copy_limited(source, src)
            with self._slot():
                dst = workdir / "output.mp4"
                self._transcoder.to_mp4(src, dst)
            return TranscodeResult(
                path=dst, workdir=workdir, download_name="video_modifiee_annotations.mp4"
            )
        except BaseException:
            shutil.rmtree(workdir, ignore_errors=True)
            raise

    def webm_to_mp4_in_library(
        self, owner_id: UUID, source: BinaryIO, parent_id: UUID | None
    ) -> Media:
        if parent_id is not None:
            self._media.get(owner_id, parent_id)  # contrôle de propriété
        result = self.webm_to_mp4(source)
        try:
            with result.path.open("rb") as handle:
                return self._media.add_derived_stream(
                    owner_id=owner_id,
                    stream=handle,
                    display_name=result.download_name,
                    source=MediaSource.EXPORT,
                    parent_id=parent_id,
                )
        finally:
            result.cleanup()

    # ------------------------------------------------------------------ #
    def _copy_limited(self, source: BinaryIO, destination: Path) -> None:
        header = source.read(4)
        if header != _WEBM_MAGIC:
            raise ValidationError("Le fichier fourni n'est pas un WebM valide")
        written = len(header)
        with destination.open("wb") as out:
            out.write(header)
            while chunk := source.read(_CHUNK):
                written += len(chunk)
                if written > self._max_bytes:
                    raise PayloadTooLargeError("Enregistrement trop volumineux")
                out.write(chunk)

    @contextmanager
    def _slot(self) -> Iterator[None]:
        # Protège le serveur : un nombre borné de conversions ffmpeg simultanées.
        if not self._slots.acquire(timeout=30):
            raise RateLimitedError("Serveur de conversion occupé, réessayez dans un instant")
        try:
            yield
        finally:
            self._slots.release()
