"""Implementation fichier JSON du stockage utilisateurs.

Conservee comme solution de repli (``USER_STORE=json``) et pour les tests :
elle reproduit le comportement d'origine avec des ecritures atomiques.
"""

import json
import logging
import os
import tempfile
import threading
from pathlib import Path

from .repository import UserRecord, UserStore

logger = logging.getLogger("goldfx")


class JsonUserStore(UserStore):
    """Stockage des utilisateurs dans un fichier JSON (atomique + verrou)."""

    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        self._lock = threading.RLock()

    def _load(self) -> dict:
        with self._lock:
            if not self._path.exists():
                return {}
            try:
                with open(self._path, encoding="utf-8") as handle:
                    data = json.load(handle)
                return data if isinstance(data, dict) else {}
            except (json.JSONDecodeError, OSError) as exc:
                logger.error("Fichier utilisateurs illisible (%s) : %s", self._path, exc)
                return {}

    def _save(self, users: dict) -> None:
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, tmp_path = tempfile.mkstemp(dir=str(self._path.parent), suffix=".tmp")
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    json.dump(users, handle, indent=2, ensure_ascii=False)
                os.replace(tmp_path, self._path)
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

    @staticmethod
    def _to_record(username: str, user: dict) -> UserRecord:
        return UserRecord(
            username=username,
            email=user.get("email", ""),
            password_hash=user.get("password", ""),
        )

    def get(self, username: str) -> UserRecord | None:
        user = self._load().get(username)
        return self._to_record(username, user) if user else None

    def exists_username(self, username: str) -> bool:
        return username in self._load()

    def exists_email(self, email: str) -> bool:
        return any(user.get("email") == email for user in self._load().values())

    def create(self, username: str, email: str, password_hash: str) -> None:
        users = self._load()
        users[username] = {"email": email, "password": password_hash}
        self._save(users)

    def all(self) -> list[UserRecord]:
        return [self._to_record(username, user) for username, user in self._load().items()]
