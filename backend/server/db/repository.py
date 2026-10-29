"""Implementation SQLAlchemy du stockage des utilisateurs.

Ce module importe SQLAlchemy : il est donc charge **a la demande** (premier
acces a la base), jamais au demarrage de l'application.
"""

from sqlalchemy import select

from .contract import UserRecord, UserStore
from .models import User


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
