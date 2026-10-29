"""Modeles SQLAlchemy de l'application.

Ajoutez vos tables ici : elles seront creees automatiquement au demarrage par
``init_db()`` (``Base.metadata.create_all``). Pour des migrations evolutives,
brancher Alembic plus tard.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .engine import Base


class User(Base):
    """Compte utilisateur de l'application."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), nullable=False
    )
