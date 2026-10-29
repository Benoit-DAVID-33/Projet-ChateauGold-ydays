"""Moteur SQLAlchemy et fabrique de sessions.

La base est configuree par ``DATABASE_URL`` (SQLite par defaut, dans
``backend/data/app.db``). Pour SQLite, ``check_same_thread`` est desactive car
les sessions sont utilisees depuis le threadpool (``run_in_threadpool``).
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .. import config


class Base(DeclarativeBase):
    """Base declarative commune a tous les modeles SQLAlchemy."""


def _ensure_sqlite_dir(url: str) -> None:
    """Cree le dossier parent du fichier SQLite s'il n'existe pas."""
    if not url.startswith("sqlite:///"):
        return
    path = Path(url.removeprefix("sqlite:///"))
    if str(path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)


def _create_engine(url: str):
    """Cree un moteur SQLAlchemy adapte au type de base."""
    _ensure_sqlite_dir(url)
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, future=True)


engine = _create_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
