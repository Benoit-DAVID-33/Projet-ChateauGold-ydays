from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from werkzeug.security import generate_password_hash

from goldfx.domain.errors import AuthenticationError
from goldfx.infrastructure.security.passwords import Argon2PasswordHasher
from goldfx.infrastructure.security.rate_limit import InMemoryRateLimiter
from goldfx.infrastructure.security.signing import HmacUrlSigner

NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)


class TestPasswords:
    hasher = Argon2PasswordHasher()

    def test_argon2_roundtrip(self) -> None:
        hashed = self.hasher.hash("secret-123")
        assert hashed.startswith("$argon2id$")
        assert self.hasher.verify(hashed, "secret-123")
        assert not self.hasher.verify(hashed, "wrong")
        assert not self.hasher.needs_rehash(hashed)

    @pytest.mark.parametrize("method", ["scrypt", "pbkdf2:sha256:1000"])
    def test_legacy_werkzeug_hashes_are_accepted_then_flagged_for_rehash(self, method: str) -> None:
        legacy = generate_password_hash("ancien-mot-de-passe", method=method)
        assert self.hasher.verify(legacy, "ancien-mot-de-passe")
        assert not self.hasher.verify(legacy, "autre")
        assert self.hasher.needs_rehash(legacy)

    @pytest.mark.parametrize(
        "garbage", ["", "nope", "scrypt:1:2:3", "md5:abc$def$123", "$argon2$x"]
    )
    def test_malformed_hashes_never_verify(self, garbage: str) -> None:
        assert not self.hasher.verify(garbage, "x")


class TestSigner:
    signer = HmacUrlSigner("k" * 40)

    def test_roundtrip(self) -> None:
        token = self.signer.sign("abc", NOW + timedelta(minutes=5))
        assert self.signer.unsign(token, NOW) == "abc"

    def test_expired(self) -> None:
        token = self.signer.sign("abc", NOW - timedelta(seconds=1))
        with pytest.raises(AuthenticationError, match="expiré"):
            self.signer.unsign(token, NOW)

    @pytest.mark.parametrize("token", ["", "abc", "a.b", "x" * 40 + ".y"])
    def test_garbage(self, token: str) -> None:
        with pytest.raises(AuthenticationError):
            self.signer.unsign(token, NOW)

    def test_tampered_or_other_key(self) -> None:
        token = self.signer.sign("abc", NOW + timedelta(minutes=5))
        payload, sig = token.split(".")
        with pytest.raises(AuthenticationError):
            self.signer.unsign(payload + "x." + sig, NOW)
        with pytest.raises(AuthenticationError):
            HmacUrlSigner("autre-cle" * 5).unsign(token, NOW)
        with pytest.raises(AuthenticationError):
            HmacUrlSigner("k" * 40, purpose="autre-usage").unsign(token, NOW)


def test_rate_limiter_window() -> None:
    now = [0.0]
    limiter = InMemoryRateLimiter(max_attempts=2, window_seconds=10, monotonic=lambda: now[0])
    assert limiter.hit("k") and limiter.hit("k")
    assert not limiter.hit("k")
    assert limiter.hit("autre")
    now[0] = 11
    assert limiter.hit("k")
    limiter.reset("k")
    assert limiter.hit("k") and limiter.hit("k")
