"""Contrat de stockage des utilisateurs, sans dependance lourde.

Ce module est charge au demarrage : il ne doit donc importer **aucune**
dependance lourde (ni SQLAlchemy, ni httpx). Il definit l'interface commune
entre les implementations (SQLAlchemy, JSON) et le reste de l'application.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


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
