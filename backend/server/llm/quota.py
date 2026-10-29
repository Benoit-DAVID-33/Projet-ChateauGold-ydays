"""Suivi des quotas par fournisseur.

Permet au routeur d'ecarter un fournisseur ayant atteint sa limite. Le compteur
est en memoire (par processus) : suffisant pour un garde-fou simple, a remplacer
par un stockage partage (Redis, base) si le service est multi-instances.
"""

import threading


class QuotaTracker:
    """Compteur de requetes par fournisseur (limite optionnelle)."""

    def __init__(self, limits: dict[str, int] | None = None) -> None:
        self._limits = dict(limits or {})
        self._counts: dict[str, int] = {}
        self._lock = threading.Lock()

    def available(self, provider: str) -> bool:
        """Indique si le fournisseur peut encore recevoir une requete."""
        limit = self._limits.get(provider)
        if limit is None or limit <= 0:
            return True
        with self._lock:
            return self._counts.get(provider, 0) < limit

    def consume(self, provider: str) -> None:
        """Enregistre une requete consommee."""
        with self._lock:
            self._counts[provider] = self._counts.get(provider, 0) + 1

    def remaining(self, provider: str) -> int | None:
        """Retourne le nombre de requetes restantes, ou None si illimite."""
        limit = self._limits.get(provider)
        if limit is None or limit <= 0:
            return None
        with self._lock:
            return max(0, limit - self._counts.get(provider, 0))
