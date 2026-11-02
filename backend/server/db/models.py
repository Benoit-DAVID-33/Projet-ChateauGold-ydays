"""Modeles SQLAlchemy de l'application.

Ajoutez vos tables ici : elles seront creees automatiquement au demarrage par
``init_db()`` (``Base.metadata.create_all``). Pour des migrations evolutives,
brancher Alembic plus tard.
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from server.db.engine import Base


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


class UserPlan(Base):
    """Offre souscrite par un utilisateur (absence de ligne = offre gratuite)."""

    __tablename__ = "user_plans"

    username: Mapped[str] = mapped_column(String(64), primary_key=True)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="free")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), nullable=False
    )


class DailyUsage(Base):
    """Generations video consommees par un utilisateur pour un jour (UTC)."""

    __tablename__ = "daily_usage"
    __table_args__ = (UniqueConstraint("username", "day", name="uq_usage_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    day: Mapped[str] = mapped_column(String(10), nullable=False)
    generations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class UpgradeRequest(Base):
    """Demande de passage a l'offre payante (traitee par un administrateur)."""

    __tablename__ = "upgrade_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), nullable=False
    )
