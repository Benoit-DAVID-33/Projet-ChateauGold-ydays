"""Suivi des quotas **quotidiens** par fournisseur.

Permet au routeur d'ecarter un fournisseur ayant atteint sa limite du jour.
Les compteurs repartent a zero a chaque changement de date (UTC). Si un
fichier est fourni, ils y sont persistes : un redemarrage du serveur ne remet
donc pas les quotas a zero. Pour un service multi-instances, remplacer ce
stockage par un stockage partage (Redis, base).
"""

import json
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger("goldfx")


def _utc_today() -> str:
    return datetime.now(UTC).date().isoformat()


class QuotaTracker:
    """Compteur de requetes par fournisseur et par jour (limite optionnelle)."""

    def __init__(
        self,
        limits: dict[str, int] | None = None,
        *,
        path: Path | None = None,
        today: Callable[[], str] = _utc_today,
    ) -> None:
        self._limits = dict(limits or {})
        self._path = path
        self._today = today
        self._lock = threading.Lock()
        self._day = today()
        self._counts: dict[str, int] = {}
        self._load()

    def _load(self) -> None:
        """Recharge les compteurs du jour depuis le fichier (s'il existe)."""
        if self._path is None or not self._path.is_file():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            logger.warning("Fichier de quotas illisible, compteurs remis à zéro : %s", self._path)
            return
        if isinstance(data, dict) and data.get("day") == self._day:
            counts = data.get("counts", {})
            if isinstance(counts, dict):
                self._counts = {str(k): int(v) for k, v in counts.items() if str(v).isdigit()}

    def _save(self) -> None:
        if self._path is None:
            return
        try:
            self._path.write_text(
                json.dumps({"day": self._day, "counts": self._counts}), encoding="utf-8"
            )
        except OSError:
            logger.warning("Écriture du fichier de quotas impossible : %s", self._path)

    def _roll_day(self) -> None:
        """Remet les compteurs a zero si la date a change (appele sous verrou)."""
        today = self._today()
        if today != self._day:
            self._day = today
            self._counts = {}

    def available(self, provider: str) -> bool:
        """Indique si le fournisseur peut encore recevoir une requete aujourd'hui."""
        limit = self._limits.get(provider)
        if limit is None or limit <= 0:
            return True
        with self._lock:
            self._roll_day()
            return self._counts.get(provider, 0) < limit

    def consume(self, provider: str) -> None:
        """Enregistre une requete consommee."""
        with self._lock:
            self._roll_day()
            self._counts[provider] = self._counts.get(provider, 0) + 1
            self._save()

    def remaining(self, provider: str) -> int | None:
        """Retourne le nombre de requetes restantes aujourd'hui, ou None si illimite."""
        limit = self._limits.get(provider)
        if limit is None or limit <= 0:
            return None
        with self._lock:
            self._roll_day()
            return max(0, limit - self._counts.get(provider, 0))
