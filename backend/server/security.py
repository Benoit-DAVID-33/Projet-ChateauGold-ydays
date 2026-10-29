"""Facade utilisateurs : hachage des mots de passe, authentification et cache.

Le stockage concret est delegue a un ``UserStore`` (SQLAlchemy par defaut,
JSON en repli). Les lectures sont mises en cache (TTL court) afin d'eviter une
requete base ou une lecture fichier a chaque affichage de page.

Le store est cree **au premier usage** (et non a l'import) : cela evite de
charger SQLAlchemy au demarrage de l'application.
"""

import logging

from . import config
from .caching import TTLCache
from .db.contract import UserRecord, UserStore

logger = logging.getLogger("goldfx")

_store: UserStore | None = None
_cache = TTLCache(default_ttl=config.CACHE_TTL_SECONDS)


def clear_cache() -> None:
    """Vide le cache utilisateurs (utile en tests)."""
    _cache.clear()


def _get_store() -> UserStore:
    """Retourne le store utilisateurs, en le creant a la premiere utilisation."""
    global _store  # pylint: disable=global-statement
    if _store is None:
        from .db import build_user_store

        _store = build_user_store()
    return _store


def _get_record(username: str) -> UserRecord | None:
    """Retourne l'utilisateur depuis le cache, ou le charge depuis le store."""
    return _cache.get_or_set(f"user:{username}", lambda: _get_store().get(username))


def authenticate(username: str, password: str) -> bool:
    """Verifie un couple identifiant / mot de passe."""
    from werkzeug.security import check_password_hash  # import differe

    if not username or not password:
        return False
    record = _get_record(username)
    if record is None or not record.password_hash:
        return False
    return check_password_hash(record.password_hash, password)


def create_user(username: str, email: str, password: str) -> tuple[bool, str]:
    """Cree un utilisateur. Retourne (succes, message)."""
    from werkzeug.security import generate_password_hash  # import differe

    store = _get_store()
    if store.exists_username(username):
        return False, "Ce nom d'utilisateur existe déjà"
    if store.exists_email(email):
        return False, "Cet email est déjà utilisé"
    store.create(username, email, generate_password_hash(password))
    _cache.invalidate(f"user:{username}")
    return True, "Compte créé avec succès ! Vous pouvez maintenant vous connecter."


def get_email(username: str) -> str:
    """Retourne l'email d'un utilisateur, chaine vide si inconnu."""
    record = _get_record(username)
    return record.email if record else ""
