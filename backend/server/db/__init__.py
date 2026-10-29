"""Persistance de l'application (SQLAlchemy).

Point d'entree unique pour la base de donnees :

- ``init_db()`` : cree les tables et importe les utilisateurs existants.
- ``get_session()`` : dependance FastAPI fournissant une session SQLAlchemy.
- ``build_user_store()`` : instancie le store utilisateurs selon ``USER_STORE``.

Pour ajouter une table : definir un modele dans ``models.py`` (heritant de
``Base``) ; ``init_db()`` la creera automatiquement. Pour une base differente,
il suffit de changer ``DATABASE_URL`` dans le ``.env``.
"""

from collections.abc import Iterator

from sqlalchemy.orm import Session

from .. import config
from .engine import Base, SessionLocal, engine
from .json_store import JsonUserStore
from .models import User
from .repository import SqlAlchemyUserStore, UserRecord, UserStore
from .seed import seed_from_json

__all__ = [
    "Base",
    "JsonUserStore",
    "SessionLocal",
    "SqlAlchemyUserStore",
    "User",
    "UserRecord",
    "UserStore",
    "build_user_store",
    "engine",
    "get_session",
    "init_db",
    "seed_from_json",
]


def build_user_store() -> UserStore:
    """Instancie le store utilisateurs configure (SQLAlchemy par defaut)."""
    if config.USER_STORE == "json":
        return JsonUserStore(config.USERS_FILE)
    return SqlAlchemyUserStore(SessionLocal)


def init_db(target_engine=None, session_factory=None) -> None:
    """Cree les tables puis importe les utilisateurs de ``users.json`` si presents.

    Les parametres optionnels facilitent les tests avec une base temporaire.
    """
    target_engine = target_engine if target_engine is not None else engine
    session_factory = session_factory if session_factory is not None else SessionLocal
    Base.metadata.create_all(target_engine)
    if config.USER_STORE != "json":
        seed_from_json(config.USERS_FILE, SqlAlchemyUserStore(session_factory))


def get_session() -> Iterator[Session]:
    """Dependance FastAPI : fournit une session SQLAlchemy puis la ferme."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
