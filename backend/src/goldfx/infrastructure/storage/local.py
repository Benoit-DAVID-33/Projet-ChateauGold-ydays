"""Stockage de fichiers sur disque local (volume Docker en production)."""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import BinaryIO

from goldfx.domain.errors import NotFoundError, PayloadTooLargeError, ValidationError

_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-]*(/[A-Za-z0-9][A-Za-z0-9_\-.]*)*$")
_CHUNK = 1024 * 1024


class LocalFileStorage:
    def __init__(self, root: Path) -> None:
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def save(self, key: str, source: BinaryIO, max_bytes: int) -> int:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        # Écriture atomique : fichier temporaire puis renommage.
        fd, tmp_name = tempfile.mkstemp(dir=target.parent, prefix=".upload-")
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as out:
                while chunk := source.read(_CHUNK):
                    written += len(chunk)
                    if written > max_bytes:
                        raise PayloadTooLargeError(
                            f"Fichier trop volumineux (max {max_bytes // (1024 * 1024)} Mo)"
                        )
                    out.write(chunk)
            tmp.replace(target)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        return written

    def save_bytes(self, key: str, data: bytes) -> int:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=target.parent, prefix=".write-")
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(data)
            tmp.replace(target)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        return len(data)

    def open(self, key: str) -> BinaryIO:
        path = self.local_path(key)
        return path.open("rb")

    def local_path(self, key: str) -> Path:
        path = self._resolve(key)
        if not path.is_file():
            raise NotFoundError("Fichier introuvable")
        return path

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)

    def _resolve(self, key: str) -> Path:
        # Les clés sont générées par l'application ; on vérifie quand même
        # qu'aucune ne peut sortir du répertoire racine.
        if not _KEY_RE.fullmatch(key) or ".." in key:
            raise ValidationError("Clé de stockage invalide")
        path = (self._root / key).resolve()
        if not path.is_relative_to(self._root):
            raise ValidationError("Clé de stockage invalide")
        return path
