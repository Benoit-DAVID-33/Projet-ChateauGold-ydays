"""Cache et compression HTTP.

Contient quatre briques independantes et sans dependance externe :

- ``TTLCache`` : cache memoire avec expiration, pour eviter de relire des
  donnees couteuses (ex. le store utilisateurs) a chaque requete.
- ``StaticCacheMiddleware`` : ajoute ``Cache-Control`` sur les fichiers
  statiques (purement des en-tetes, sans mise en memoire du corps).
- ``CompressibleStaticFiles`` : sert les fichiers texte dans le corps HTTP pour
  qu'ils puissent etre compresses (voir plus bas).
- ``SelectiveGZipMiddleware`` : compresse les reponses textuelles (HTML, JSON,
  CSS, JS, SVG) mais jamais les medias, afin de ne pas casser les requetes
  HTTP Range utilisees pour la lecture video.
"""

import gzip
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import Response
from starlette.staticfiles import StaticFiles

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


class CompressibleStaticFiles(StaticFiles):
    """Sert les fichiers texte dans le corps HTTP (et non en envoi direct).

    Certains serveurs (granian) envoient les fichiers via ``pathsend``, ce qui
    court-circuite le corps HTTP : la compression gzip ne peut alors pas
    s'appliquer. Pour les fichiers texte (CSS, JS, SVG...), on lit le contenu et
    on le renvoie comme reponse normale, ce qui permet a
    ``SelectiveGZipMiddleware`` de le compresser.
    """

    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        if scope.get("method") != "GET" or response.status_code != 200:
            return response
        media_type = response.headers.get("content-type", "")
        if not media_type.startswith(_TEXTUAL_CONTENT_TYPES):
            return response
        full_path = getattr(response, "path", None)
        if not full_path:
            return response
        try:
            data = await run_in_threadpool(Path(full_path).read_bytes)
        except OSError:
            return response
        return Response(data, status_code=200, media_type=media_type)


class SelectiveGZipMiddleware:
    """Compresse les reponses textuelles, laisse passer les medias tels quels.

    Le filtrage par type de contenu evite de compresser les videos/images, ce
    qui gaspillerait du CPU et invaliderait les requetes HTTP Range. Les messages
    non standard (``pathsend``) sont transmis sans compression.
    """

    def __init__(self, app, minimum_size: int = 500) -> None:
        self.app = app
        self.minimum_size = minimum_size

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or "gzip" not in Headers(scope=scope).get("accept-encoding", ""):
            await self.app(scope, receive, send)
            return

        state: dict[str, Any] = {
            "compress": False,
            "start": None,
            "body": bytearray(),
            "started": False,
        }

        async def send_wrapper(message):
            message_type = message["type"]
            if message_type == "http.response.start":
                state["start"] = message
                content_type = Headers(raw=message["headers"]).get("content-type", "")
                state["compress"] = content_type.startswith(_TEXTUAL_CONTENT_TYPES)
                if not state["compress"]:
                    state["started"] = True
                    await send(message)
            elif message_type == "http.response.body":
                if not state["compress"]:
                    await send(message)
                    return
                state["body"].extend(message.get("body", b""))
                if not message.get("more_body", False):
                    await self._flush(state, send)
            else:
                await self._send_pending_plain(state, send)
                await send(message)

        await self.app(scope, receive, send_wrapper)

    async def _send_pending_plain(self, state: dict[str, Any], send) -> None:
        """Envoie la reponse en attente sans compression (si pas deja envoyee)."""
        if state["started"] or state["start"] is None:
            return
        await send(state["start"])
        await send({"type": "http.response.body", "body": bytes(state["body"])})
        state["started"] = True
        state["compress"] = False
        state["body"].clear()

    async def _flush(self, state: dict[str, Any], send) -> None:
        """Envoie la reponse compressee si elle depasse la taille minimale."""
        body = bytes(state["body"])
        if len(body) < self.minimum_size:
            await self._send_pending_plain(state, send)
            return

        compressed = gzip.compress(body, compresslevel=6)
        headers = MutableHeaders(scope=state["start"])
        headers["Content-Encoding"] = "gzip"
        headers["Content-Length"] = str(len(compressed))
        headers.add_vary_header("Accept-Encoding")
        await send(state["start"])
        await send({"type": "http.response.body", "body": compressed})
        state["started"] = True
