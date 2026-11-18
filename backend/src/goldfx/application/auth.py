"""Cas d'usage d'authentification : inscription, connexion, sessions."""

from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from goldfx.domain.errors import (
    AuthenticationError,
    ConflictError,
    RateLimitedError,
    ValidationError,
)
from goldfx.domain.models import Session, User
from goldfx.domain.ports import Clock, PasswordHasher, RateLimiter, UnitOfWork

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{3,32}$")
# Validation volontairement simple : le schéma API valide déjà le format complet.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_token(token: str) -> str:
    """Seul le hash du jeton de session est stocké en base."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class AuthPolicy:
    password_min_length: int
    session_ttl: timedelta


@dataclass(frozen=True, slots=True)
class LoginResult:
    user: User
    token: str
    session: Session


class AuthService:
    def __init__(
        self,
        uow: UnitOfWork,
        hasher: PasswordHasher,
        clock: Clock,
        rate_limiter: RateLimiter,
        policy: AuthPolicy,
    ) -> None:
        self._uow = uow
        self._hasher = hasher
        self._clock = clock
        self._limiter = rate_limiter
        self._policy = policy

    # ------------------------------------------------------------------ #
    def register(self, username: str, email: str, password: str) -> User:
        username = username.strip()
        email = email.strip().lower()
        self._validate_registration(username, email, password)

        if self._uow.users.get_by_username(username) is not None:
            raise ConflictError("Ce nom d'utilisateur existe déjà")
        if self._uow.users.get_by_email(email) is not None:
            raise ConflictError("Cet email est déjà utilisé")

        user = User(
            id=uuid.uuid4(),
            username=username,
            email=email,
            password_hash=self._hasher.hash(password),
            created_at=self._clock.now(),
        )
        self._uow.users.add(user)
        self._uow.commit()
        return user

    def login(self, identifier: str, password: str, client_key: str) -> LoginResult:
        """Connexion par nom d'utilisateur OU email."""
        identifier = identifier.strip()
        limiter_key = f"login:{client_key}:{identifier.lower()}"
        if not self._limiter.hit(limiter_key):
            raise RateLimitedError("Trop de tentatives. Réessayez dans quelques minutes.")

        user = self._uow.users.get_by_username(identifier)
        if user is None and "@" in identifier:
            user = self._uow.users.get_by_email(identifier.lower())

        # Message volontairement identique dans tous les cas (pas d'énumération).
        if user is None or not user.is_active:
            self._hasher.hash(password)  # temps de réponse homogène
            raise AuthenticationError("Identifiants incorrects")
        if not self._hasher.verify(user.password_hash, password):
            raise AuthenticationError("Identifiants incorrects")

        # Migration transparente des anciens hashes (werkzeug) vers Argon2id.
        if self._hasher.needs_rehash(user.password_hash):
            user.password_hash = self._hasher.hash(password)
            self._uow.users.update_password_hash(user.id, user.password_hash)

        self._limiter.reset(limiter_key)
        now = self._clock.now()
        token = secrets.token_urlsafe(32)
        session = Session(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + self._policy.session_ttl,
        )
        self._uow.sessions.add(session)
        self._uow.sessions.delete_expired(now)
        self._uow.commit()
        return LoginResult(user=user, token=token, session=session)

    def logout(self, token: str) -> None:
        self._uow.sessions.delete(hash_token(token))
        self._uow.commit()

    def resolve(self, token: str) -> User:
        """Retourne l'utilisateur associé à un jeton de session valide."""
        session = self._uow.sessions.get(hash_token(token))
        if session is None:
            raise AuthenticationError("Session invalide")
        if session.expires_at <= self._clock.now():
            self._uow.sessions.delete(session.token_hash)
            self._uow.commit()
            raise AuthenticationError("Session expirée")
        user = self._uow.users.get(session.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Session invalide")
        return user

    # ------------------------------------------------------------------ #
    def _validate_registration(self, username: str, email: str, password: str) -> None:
        if not _USERNAME_RE.fullmatch(username):
            raise ValidationError(
                "Le nom d'utilisateur doit contenir 3 à 32 caractères "
                "(lettres, chiffres, « _ », « - » ou « . »)."
            )
        if not _EMAIL_RE.fullmatch(email):
            raise ValidationError("Adresse email invalide")
        if len(password) < self._policy.password_min_length:
            raise ValidationError(
                f"Le mot de passe doit contenir au moins "
                f"{self._policy.password_min_length} caractères."
            )
        if len(password) > 1024:
            raise ValidationError("Mot de passe trop long")
