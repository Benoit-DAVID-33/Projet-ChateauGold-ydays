"""Limiteur à fenêtre glissante, en mémoire.

Suffisant pour freiner le brute-force sur un déploiement mono-instance. Pour
plusieurs instances, implémenter le port ``RateLimiter`` sur Redis/Postgres.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable


class InMemoryRateLimiter:
    def __init__(
        self,
        max_attempts: int,
        window_seconds: float,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max = max_attempts
        self._window = window_seconds
        self._now = monotonic
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        now = self._now()
        with self._lock:
            bucket = self._hits.setdefault(key, deque())
            while bucket and now - bucket[0] > self._window:
                bucket.popleft()
            if len(bucket) >= self._max:
                return False
            bucket.append(now)
            if len(self._hits) > 10_000:  # borne mémoire
                self._purge(now)
            return True

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def _purge(self, now: float) -> None:
        stale = [k for k, b in self._hits.items() if not b or now - b[-1] > self._window]
        for key in stale:
            del self._hits[key]
