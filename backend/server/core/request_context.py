"""Middleware ASGI de tracabilite : identifiant de requete et temps de traitement.

- ``X-Request-ID`` : repris du client s'il est fourni (sinon genere) et renvoye
  dans la reponse ; il figure dans les journaux pour relier une erreur a une
  requete precise.
- ``Server-Timing: app;dur=<ms>`` : duree de traitement visible dans l'onglet
  Reseau du navigateur (diagnostic de performance sans outil externe).

Ecrit en ASGI pur (et non ``BaseHTTPMiddleware``) : aucun tampon sur les
reponses en flux (videos), surcout negligeable.
"""

from __future__ import annotations

import logging
import re
import time
import uuid

logger = logging.getLogger("goldfx")

_VALID_ID = re.compile(r"^[\w.-]{6,64}$")


class RequestContextMiddleware:
    """Ajoute ``X-Request-ID`` et ``Server-Timing`` a chaque reponse HTTP."""

    def __init__(self, app, slow_ms: float = 1500.0) -> None:
        self.app = app
        self.slow_ms = slow_ms

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex[:12]
        scope.setdefault("state", {})["request_id"] = request_id
        started = time.perf_counter()

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                elapsed = (time.perf_counter() - started) * 1000
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                headers.append((b"server-timing", f"app;dur={elapsed:.1f}".encode("latin-1")))
                message["headers"] = headers
                if elapsed > self.slow_ms:
                    logger.info(
                        "Requête lente %s %s : %.0f ms [%s]",
                        scope.get("method"),
                        scope.get("path"),
                        elapsed,
                        request_id,
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)
