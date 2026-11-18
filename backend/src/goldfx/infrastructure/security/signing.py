"""Liens signés (HMAC-SHA256) à durée de vie limitée."""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime

from goldfx.domain.errors import AuthenticationError


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


class HmacUrlSigner:
    def __init__(self, secret: str, purpose: str = "public-media") -> None:
        # La clé est dérivée par usage : un jeton d'un autre usage n'est pas valide ici.
        self._key = hashlib.sha256(f"{purpose}:{secret}".encode()).digest()

    def sign(self, value: str, expires_at: datetime) -> str:
        payload = f"{value}|{int(expires_at.timestamp())}".encode()
        signature = hmac.new(self._key, payload, hashlib.sha256).digest()
        return f"{_b64(payload)}.{_b64(signature)}"

    def unsign(self, token: str, now: datetime) -> str:
        try:
            payload_b64, signature_b64 = token.split(".", 1)
            payload = _unb64(payload_b64)
            signature = _unb64(signature_b64)
        except ValueError as exc:
            raise AuthenticationError("Lien invalide") from exc
        expected = hmac.new(self._key, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise AuthenticationError("Lien invalide")
        value, _, expiry = payload.decode().rpartition("|")
        if not expiry.isdigit() or int(expiry) < int(now.timestamp()):
            raise AuthenticationError("Lien expiré")
        return value
