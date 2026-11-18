"""Hachage des mots de passe : Argon2id, avec lecture des anciens hashes werkzeug.

L'ancienne application stockait des hashes ``werkzeug`` (``scrypt:…`` ou
``pbkdf2:…``) dans ``users.json``. Ils restent vérifiables pour que les comptes
importés puissent se connecter ; ils sont alors re-hachés en Argon2id
(``needs_rehash``), sans action de l'utilisateur.
"""

from __future__ import annotations

import hashlib
import hmac

from argon2 import PasswordHasher as _Argon2
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_LEGACY_PREFIXES = ("scrypt:", "pbkdf2:")


class Argon2PasswordHasher:
    def __init__(self) -> None:
        # Paramètres par défaut d'argon2-cffi (profil RFC 9106 « low memory »).
        self._argon = _Argon2()

    def hash(self, password: str) -> str:
        return str(self._argon.hash(password))

    def verify(self, password_hash: str, password: str) -> bool:
        if password_hash.startswith(_LEGACY_PREFIXES):
            return _verify_werkzeug(password_hash, password)
        try:
            return bool(self._argon.verify(password_hash, password))
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    def needs_rehash(self, password_hash: str) -> bool:
        if password_hash.startswith(_LEGACY_PREFIXES):
            return True
        try:
            return bool(self._argon.check_needs_rehash(password_hash))
        except InvalidHashError:
            return True


def _verify_werkzeug(password_hash: str, password: str) -> bool:
    """Vérifie un hash au format werkzeug ``methode:params$sel$hex``."""
    try:
        method, salt, expected = password_hash.split("$", 2)
    except ValueError:
        return False
    parts = method.split(":")
    secret = password.encode("utf-8")
    try:
        if parts[0] == "scrypt":
            n, r, p = (int(x) for x in parts[1:4]) if len(parts) >= 4 else (2**15, 8, 1)
            computed = hashlib.scrypt(
                secret, salt=salt.encode("utf-8"), n=n, r=r, p=p, maxmem=132 * n * r * p
            ).hex()
        elif parts[0] == "pbkdf2":
            algo = parts[1] if len(parts) > 1 else "sha256"
            iterations = int(parts[2]) if len(parts) > 2 else 600_000
            computed = hashlib.pbkdf2_hmac(algo, secret, salt.encode("utf-8"), iterations).hex()
        else:
            return False
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(computed, expected)
