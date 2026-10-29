"""Facade utilisateurs : hachage des mots de passe, authentification et cache.

Le stockage concret est delegue a un ``UserStore`` (SQLAlchemy par defaut,
JSON en repli). Les lectures sont mises en cache (TTL court) afin d'eviter une
requete base ou une lecture fichier a chaque affichage de page.
"""

import logging

from werkzeug.security import check_password_hash, generate_password_hash

from . import config
from .caching import TTLCache
from .db import UserRecord, UserStore, build_user_store

logger = logging.getLogger("goldfx")

_store: UserStore = build_user_store()
_cache = TTLCache(default_ttl=config.CACHE_TTL_SECONDS)


def clear_cache() -> None:
    """Vide le cache utilisateurs (utile en tests)."""
    _cache.clear()


def _get_record(username: str) -> UserRecord | None:
    """Retourne l'utilisateur depuis le cache, ou le charge depuis le store."""
    return _cache.get_or_set(f"user:{username}", lambda: _store.get(username))


def authenticate(username: str, password: str) -> bool:
    """Verifie un couple identifiant / mot de passe."""
    if not username or not password:
        return False
    record = _get_record(username)
    if record is None or not record.password_hash:
        return False
    return check_password_hash(record.password_hash, password)


def create_user(username: str, email: str, password: str) -> tuple[bool, str]:
    """Cree un utilisateur. Retourne (succes, message)."""
    if _store.exists_username(username):
        return False, "Ce nom d'utilisateur existe déjà"
    if _store.exists_email(email):
        return False, "Cet email est déjà utilisé"
    _store.create(username, email, generate_password_hash(password))
    _cache.invalidate(f"user:{username}")
    return True, "Compte créé avec succès ! Vous pouvez maintenant vous connecter."


def get_email(username: str) -> str:
    """Retourne l'email d'un utilisateur, chaine vide si inconnu."""
    record = _get_record(username)
    return record.email if record else ""
