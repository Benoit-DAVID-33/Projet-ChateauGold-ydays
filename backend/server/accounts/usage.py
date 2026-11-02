"""Offre souscrite et consommation quotidienne de chaque utilisateur.

Stockage SQLAlchemy (tables ``user_plans``, ``daily_usage``,
``upgrade_requests``). La reservation de generations est **atomique** (verrou
+ transaction) : deux travaux lances en meme temps ne peuvent pas depasser le
quota du jour.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from server.accounts.plans import Plan, get_plan


def utc_day() -> str:
    """Jour courant (UTC) au format AAAA-MM-JJ."""
    return datetime.now(UTC).date().isoformat()


@dataclass(frozen=True)
class UsageSnapshot:
    """Etat de consommation d'un utilisateur pour aujourd'hui."""

    plan: Plan
    used: int

    @property
    def remaining(self) -> int:
        """Generations encore disponibles aujourd'hui."""
        return max(0, self.plan.daily_generations - self.used)

    def as_dict(self) -> dict:
        """Representation JSON (pour l'API)."""
        return {
            "plan": self.plan.key,
            "label": self.plan.label,
            "daily_generations": self.plan.daily_generations,
            "used_today": self.used,
            "remaining_today": self.remaining,
            "qualities": list(self.plan.qualities),
            "max_edits_per_job": self.plan.max_edits_per_job,
            "max_video_seconds": self.plan.max_video_seconds,
        }


class QuotaExceeded(Exception):
    """Le travail demande depasse les generations restantes du jour."""


class UsageStore:
    """Acces aux offres et a la consommation (SQLAlchemy)."""

    def __init__(self, session_factory: Any = None) -> None:
        self._session_factory = session_factory
        self._lock = threading.Lock()

    def _session(self):
        if self._session_factory is None:
            from server import db
            from server.db.engine import SessionLocal

            db.ensure_initialized()
            self._session_factory = SessionLocal
        return self._session_factory()

    def plan_of(self, username: str) -> Plan:
        """Offre de l'utilisateur (gratuite par defaut)."""
        from server.db.models import UserPlan

        with self._session() as session:
            row = session.get(UserPlan, username)
            return get_plan(row.plan if row else "free")

    def set_plan(self, username: str, plan_key: str) -> Plan:
        """Attribue une offre (action d'administration)."""
        from server.db.models import UserPlan

        plan = get_plan(plan_key)
        with self._session() as session:
            row = session.get(UserPlan, username)
            if row is None:
                session.add(UserPlan(username=username, plan=plan.key))
            else:
                row.plan = plan.key
                row.updated_at = datetime.now(UTC)
            session.commit()
        return plan

    def _used(self, session, username: str, day: str) -> int:
        from sqlalchemy import select

        from server.db.models import DailyUsage

        row = session.scalar(
            select(DailyUsage).where(DailyUsage.username == username, DailyUsage.day == day)
        )
        return row.generations if row else 0

    def snapshot(self, username: str) -> UsageSnapshot:
        """Offre + consommation du jour."""
        plan = self.plan_of(username)
        with self._session() as session:
            return UsageSnapshot(plan=plan, used=self._used(session, username, utc_day()))

    def reserve(self, username: str, generations: int) -> UsageSnapshot:
        """Reserve ``generations`` pour aujourd'hui, ou leve ``QuotaExceeded``."""
        from sqlalchemy import select

        from server.db.models import DailyUsage

        plan = self.plan_of(username)
        day = utc_day()
        with self._lock, self._session() as session:
            row = session.scalar(
                select(DailyUsage).where(DailyUsage.username == username, DailyUsage.day == day)
            )
            used = row.generations if row else 0
            if used + generations > plan.daily_generations:
                raise QuotaExceeded(
                    f"Quota du jour atteint : {plan.daily_generations - used} génération(s) "
                    f"restante(s), {generations} nécessaire(s) (offre {plan.label})."
                )
            if row is None:
                session.add(DailyUsage(username=username, day=day, generations=generations))
            else:
                row.generations = used + generations
            session.commit()
            return UsageSnapshot(plan=plan, used=used + generations)

    def refund(self, username: str, generations: int, day: str) -> None:
        """Rend des generations non consommees (travail echoue avant l'appel payant)."""
        from sqlalchemy import select

        from server.db.models import DailyUsage

        if generations <= 0:
            return
        with self._lock, self._session() as session:
            row = session.scalar(
                select(DailyUsage).where(DailyUsage.username == username, DailyUsage.day == day)
            )
            if row is not None:
                row.generations = max(0, row.generations - generations)
                session.commit()

    def request_upgrade(self, username: str, plan_key: str, message: str) -> int:
        """Enregistre une demande de passage a une offre payante. Retourne son id."""
        from server.db.models import UpgradeRequest

        with self._session() as session:
            request = UpgradeRequest(
                username=username, plan=get_plan(plan_key).key, message=message[:1000]
            )
            session.add(request)
            session.commit()
            return request.id

    def pending_upgrades(self) -> list[dict]:
        """Demandes en attente (console d'administration)."""
        from sqlalchemy import select

        from server.db.models import UpgradeRequest

        with self._session() as session:
            rows = session.scalars(
                select(UpgradeRequest)
                .where(UpgradeRequest.status == "pending")
                .order_by(UpgradeRequest.created_at)
            ).all()
            return [
                {
                    "id": row.id,
                    "username": row.username,
                    "plan": row.plan,
                    "message": row.message,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]

    def close_upgrade(self, request_id: int, status: str) -> None:
        """Marque une demande comme traitee (``granted`` ou ``rejected``)."""
        from server.db.models import UpgradeRequest

        with self._session() as session:
            row = session.get(UpgradeRequest, request_id)
            if row is not None:
                row.status = status
                session.commit()


_store: UsageStore | None = None


def get_usage_store() -> UsageStore:
    """Store partage (cree au premier usage, pour ne pas charger SQLAlchemy au demarrage)."""
    global _store  # pylint: disable=global-statement
    if _store is None:
        _store = UsageStore()
    return _store
