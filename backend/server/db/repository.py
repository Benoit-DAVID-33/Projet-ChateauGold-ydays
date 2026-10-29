"""Contrat de stockage des utilisateurs et implementation SQLAlchemy.

Le reste de l'application ne depend que de l'interface ``UserStore``. Les deux
membres qui gerent la base peuvent donc remplacer l'implementation par la leur
(ou modifier ``models.py``) sans toucher au reste du code.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass

from sqlalchemy import select

from .models import User


@dataclass(frozen=True)
class UserRecord:
    """Representation neutre d'un utilisateur (independante de l'ORM)."""

    username: str
    email: str
    password_hash: str


class UserStore(ABC):
    """Interface de persistance des utilisateurs."""

    @abstractmethod
    def get(self, username: str) -> UserRecord | None:
        """Retourne l'utilisateur, ou None s'il n'existe pas."""

    @abstractmethod
    def exists_username(self, username: str) -> bool:
        """Indique si le nom d'utilisateur est deja pris."""

    @abstractmethod
    def exists_email(self, email: str) -> bool:
        """Indique si l'email est deja utilise."""

    @abstractmethod
    def create(self, username: str, email: str, password_hash: str) -> None:
        """Cree un utilisateur."""

    @abstractmethod
    def all(self) -> list[UserRecord]:
        """Retourne tous les utilisateurs (utile pour l'import/seed)."""


class SqlAlchemyUserStore(UserStore):
    """Implementation SQLAlchemy du stockage des utilisateurs."""

    def __init__(self, session_factory) -> None:
        self._session_factory = session_factory

    def get(self, username: str) -> UserRecord | None:
        with self._session_factory() as session:
            user = session.scalar(select(User).where(User.username == username))
            return self._to_record(user)

    def exists_username(self, username: str) -> bool:
        with self._session_factory() as session:
            return session.scalar(select(User.id).where(User.username == username)) is not None

    def exists_email(self, email: str) -> bool:
        with self._session_factory() as session:
            return session.scalar(select(User.id).where(User.email == email)) is not None

    def create(self, username: str, email: str, password_hash: str) -> None:
        with self._session_factory() as session:
            session.add(User(username=username, email=email, password_hash=password_hash))
            session.commit()

    def all(self) -> list[UserRecord]:
        with self._session_factory() as session:
            users = session.scalars(select(User)).all()
            return [record for record in (self._to_record(user) for user in users) if record]

    @staticmethod
    def _to_record(user: User | None) -> UserRecord | None:
        if user is None:
            return None
        return UserRecord(
            username=user.username, email=user.email, password_hash=user.password_hash
        )
