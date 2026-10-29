"""Cache et compression HTTP.

Contient trois briques independantes et sans dependance externe :

- ``TTLCache`` : cache memoire avec expiration, pour eviter de relire des
  donnees couteuses (ex. le store utilisateurs) a chaque requete.
- ``StaticCacheMiddleware`` : ajoute ``Cache-Control`` sur les fichiers
  statiques (purement des en-tetes, sans mise en memoire du corps).
- ``SelectiveGZipMiddleware`` : compresse les reponses textuelles (HTML, JSON,
  CSS, JS, SVG) mais jamais les medias, afin de ne pas casser les requetes
  HTTP Range utilisees pour la lecture video.
"""

import gzip
import threading
import time
from collections.abc import Callable
from typing import Any

from starlette.datastructures import Headers, MutableHeaders

_MISSING = object()

_TEXTUAL_CONTENT_TYPES = (
    "text/",
    "application/json",
    "application/javascript",
    "application/xml",
    "image/svg+xml",
)


class TTLCache:
    """Cache cle/valeur en memoire, thread-safe, avec expiration par entree."""

    def __init__(self, default_ttl: float = 5.0, max_size: int = 1024) -> None:
        self._default_ttl = default_ttl
        self._max_size = max_size
        self._lock = threading.RLock()
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, default: Any = None) -> Any:
        """Retourne la valeur associee, ou ``default`` si absente ou expiree."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return default
            expires_at, value = entry
            if expires_at < time.monotonic():
                self._store.pop(key, None)
                return default
            return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Enregistre une valeur avec une duree de vie optionnelle."""
        with self._lock:
            if key not in self._store and len(self._store) >= self._max_size:
                self._evict()
            self._store[key] = (
                time.monotonic() + (self._default_ttl if ttl is None else ttl),
                value,
            )

    def get_or_set(self, key: str, factory: Callable[[], Any], ttl: float | None = None) -> Any:
        """Retourne la valeur en cache, ou la calcule via ``factory`` puis la stocke."""
        value = self.get(key, _MISSING)
        if value is not _MISSING:
            return value
        value = factory()
        self.set(key, value, ttl)
        return value

    def invalidate(self, key: str) -> None:
        """Supprime une entree du cache."""
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        """Vide entierement le cache."""
        with self._lock:
            self._store.clear()

    def _evict(self) -> None:
        """Retire les entrees expirees, ou la plus ancienne si necessaire."""
        now = time.monotonic()
        for key in [k for k, (expires, _) in self._store.items() if expires < now]:
            self._store.pop(key, None)
        if len(self._store) >= self._max_size:
            self._store.pop(next(iter(self._store)))


class StaticCacheMiddleware:
    """Ajoute un en-tete ``Cache-Control`` aux fichiers servis sous un prefixe."""

    def __init__(self, app, prefix: str = "/static/", max_age: int = 31536000) -> None:
        self.app = app
        self.prefix = prefix
        self.value = f"public, max-age={max_age}, immutable"

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(self.prefix):
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).setdefault("cache-control", self.value)
            await send(message)

        await self.app(scope, receive, send_wrapper)


class SelectiveGZipMiddleware:
    """Compresse les reponses textuelles, laisse passer les medias tels quels.

    Le filtrage par type de contenu evite de compresser les videos/images, ce
    qui gaspillerait du CPU et invaliderait les requetes HTTP Range.
    """

    def __init__(self, app, minimum_size: int = 500) -> None:
        self.app = app
        self.minimum_size = minimum_size

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or "gzip" not in Headers(scope=scope).get("accept-encoding", ""):
            await self.app(scope, receive, send)
            return

        state: dict[str, Any] = {"compress": False, "start": None, "body": bytearray()}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                state["start"] = message
                content_type = Headers(raw=message["headers"]).get("content-type", "")
                state["compress"] = content_type.startswith(_TEXTUAL_CONTENT_TYPES)
                if not state["compress"]:
                    await send(message)
            elif message["type"] == "http.response.body":
                if not state["compress"]:
                    await send(message)
                    return
                state["body"].extend(message.get("body", b""))
                if not message.get("more_body", False):
                    await self._flush(state, send)
            else:
                await send(message)

        await self.app(scope, receive, send_wrapper)

    async def _flush(self, state: dict[str, Any], send) -> None:
        start_message = state["start"]
        body = bytes(state["body"])
        if len(body) < self.minimum_size:
            await send(start_message)
            await send({"type": "http.response.body", "body": body})
            return

        compressed = gzip.compress(body, compresslevel=6)
        headers = MutableHeaders(scope=start_message)
        headers["Content-Encoding"] = "gzip"
        headers["Content-Length"] = str(len(compressed))
        headers.add_vary_header("Accept-Encoding")
        await send(start_message)
        await send({"type": "http.response.body", "body": compressed})
