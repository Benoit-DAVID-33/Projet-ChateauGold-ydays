"""Middlewares ASGI : CSRF (double-submit), en-têtes de sécurité, journalisation."""

from __future__ import annotations

import hmac
import logging
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .deps import CSRF_COOKIE, CSRF_HEADER
from .errors import error_body

logger = logging.getLogger("goldfx.http")

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# Pas de CSRF pour les liens signés (consommés par Kling, sans cookie).
_CSRF_EXEMPT_PREFIXES = ("/api/public/",)


def _cookie(headers: Headers, name: str) -> str | None:
    raw = headers.get("cookie")
    if not raw:
        return None
    for part in raw.split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


class CsrfMiddleware:
    """Exige ``X-CSRF-Token`` == cookie ``goldfx_csrf`` sur toute écriture /api.

    Complète le ``SameSite=Lax`` du cookie de session : une page tierce ne peut
    ni lire le cookie CSRF ni poser l'en-tête personnalisé.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        method: str = scope["method"]
        if (
            method in _SAFE_METHODS
            or not path.startswith("/api/")
            or path.startswith(_CSRF_EXEMPT_PREFIXES)
        ):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        cookie = _cookie(headers, CSRF_COOKIE)
        header = headers.get(CSRF_HEADER.lower())
        if not cookie or not header or not hmac.compare_digest(cookie, header):
            response = JSONResponse(
                error_body("csrf_failed", "Jeton CSRF manquant ou invalide. Rechargez la page."),
                status_code=403,
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Referrer-Policy", "same-origin")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_wrapper)


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = Headers(scope=scope).get("x-request-id") or uuid.uuid4().hex[:16]
        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            if scope["path"] not in ("/api/health", "/api/health/ready"):
                logger.info(
                    "%s %s %s %.1fms rid=%s",
                    scope["method"],
                    scope["path"],
                    status_code,
                    (time.perf_counter() - start) * 1000,
                    request_id,
                )
