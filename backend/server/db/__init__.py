"""Persistance de l'application (SQLAlchemy, charge a la demande).

Pourquoi du chargement paresseux (lazy) ? SQLAlchemy represente environ
**300 ms** d'import. Il n'est utile qu'au premier acces a la base, jamais au
demarrage : on l'importe donc a ce moment-la, ce qui accelere nettement le
demarrage a froid (important en conteneur).

Point d'entree unique :

- ``init_db()`` : cree les tables et importe les utilisateurs existants.
- ``ensure_initialized()`` : idem, mais seulement si ce n'est pas deja fait.
- ``get_session()`` : dependance FastAPI fournissant une session SQLAlchemy.
- ``build_user_store()`` : instancie le store utilisateurs selon ``USER_STORE``.

Pour ajouter une table : definir un modele dans ``models.py`` (heritant de
``Base``) ; ``init_db()`` la creera automatiquement. Pour une base differente,
changer ``DATABASE_URL`` dans le ``.env``.
"""

import threading
from collections.abc import Iterator
from importlib import import_module
from typing import Any

from .. import config
from .contract import UserRecord, UserStore
from .json_store import JsonUserStore

__all__ = [
    "JsonUserStore",
    "UserRecord",
    "UserStore",
    "build_user_store",
    "ensure_initialized",
    "get_session",
    "init_db",
]
# Les symboles SQLAlchemy (Base, SessionLocal, engine, User, SqlAlchemyUserStore,
# seed_from_json) sont exposes via __getattr__ ci-dessous, pas dans __all__.

# Symboles SQLAlchemy importes paresseusement : nom -> (sous-module, attribut).
_LAZY_SQLALCHEMY = {
    "Base": (".engine", "Base"),
    "SessionLocal": (".engine", "SessionLocal"),
    "engine": (".engine", "engine"),
    "User": (".models", "User"),
    "SqlAlchemyUserStore": (".repository", "SqlAlchemyUserStore"),
    "seed_from_json": (".seed", "seed_from_json"),
}

_init_lock = threading.Lock()
_initialized = False


def __getattr__(name: str) -> Any:
    """Importe a la demande les symboles SQLAlchemy (PEP 562)."""
    if name in _LAZY_SQLALCHEMY:
        module_name, attribute = _LAZY_SQLALCHEMY[name]
        return getattr(import_module(module_name, __name__), attribute)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def init_db(target_engine=None, session_factory=None) -> None:
    """Cree les tables puis importe les utilisateurs de ``users.json`` si presents.

    Les parametres optionnels facilitent les tests avec une base temporaire.
    """
    global _initialized  # pylint: disable=global-statement
    with _init_lock:
        from .engine import Base, SessionLocal, engine
        from .repository import SqlAlchemyUserStore
        from .seed import seed_from_json

        target_engine = target_engine if target_engine is not None else engine
        session_factory = session_factory if session_factory is not None else SessionLocal
        Base.metadata.create_all(target_engine)
        if config.USER_STORE != "json":
            seed_from_json(config.USERS_FILE, SqlAlchemyUserStore(session_factory))
        _initialized = True


def ensure_initialized() -> None:
    """Initialise la base si ce n'est pas deja fait (idempotent)."""
    if not _initialized:
        init_db()


def build_user_store() -> UserStore:
    """Instancie le store utilisateurs configure (SQLAlchemy par defaut)."""
    if config.USER_STORE == "json":
        return JsonUserStore(config.USERS_FILE)
    from .engine import SessionLocal
    from .repository import SqlAlchemyUserStore

    ensure_initialized()
    return SqlAlchemyUserStore(SessionLocal)


def get_session() -> Iterator[Any]:
    """Dependance FastAPI : fournit une session SQLAlchemy puis la ferme."""
    from .engine import SessionLocal

    ensure_initialized()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
