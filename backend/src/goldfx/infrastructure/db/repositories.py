"""Implémentations SQLAlchemy des ports de persistance + unité de travail."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session as OrmSession

from goldfx.domain.models import (
    Generation,
    GenerationKind,
    GenerationStatus,
    Media,
    MediaKind,
    MediaSource,
    Session,
    User,
    Workflow,
)

from .schema import GenerationRow, MediaRow, SessionRow, UserRow, WorkflowRow

# --------------------------------------------------------------------------- #
# Conversions entre lignes SQL et entités
# --------------------------------------------------------------------------- #


def _user(row: UserRow) -> User:
    return User(
        id=row.id,
        username=row.username,
        email=row.email,
        password_hash=row.password_hash,
        created_at=row.created_at,
        is_active=row.is_active,
    )


def _media(row: MediaRow) -> Media:
    return Media(
        id=row.id,
        owner_id=row.owner_id,
        kind=MediaKind(row.kind),
        source=MediaSource(row.source),
        original_name=row.original_name,
        storage_key=row.storage_key,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        created_at=row.created_at,
        parent_id=row.parent_id,
    )


def _generation(row: GenerationRow) -> Generation:
    return Generation(
        id=row.id,
        owner_id=row.owner_id,
        kind=GenerationKind(row.kind),
        status=GenerationStatus(row.status),
        prompt=row.prompt,
        parameters=dict(row.parameters or {}),
        provider_task_id=row.provider_task_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        source_media_id=row.source_media_id,
        error_message=row.error_message,
        result_media_ids=[uuid.UUID(v) for v in (row.result_media_ids or [])],
    )


# --------------------------------------------------------------------------- #
# Dépôts
# --------------------------------------------------------------------------- #


class SqlUserRepository:
    def __init__(self, session: OrmSession) -> None:
        self._s = session

    def get(self, user_id: UUID) -> User | None:
        row = self._s.get(UserRow, user_id)
        return _user(row) if row else None

    def get_by_username(self, username: str) -> User | None:
        # Comparaison insensible à la casse : « Ben » et « ben » sont le même compte.
        row = self._s.scalar(
            select(UserRow).where(func.lower(UserRow.username) == username.lower())
        )
        return _user(row) if row else None

    def get_by_email(self, email: str) -> User | None:
        row = self._s.scalar(select(UserRow).where(func.lower(UserRow.email) == email.lower()))
        return _user(row) if row else None

    def add(self, user: User) -> None:
        self._s.add(
            UserRow(
                id=user.id,
                username=user.username,
                email=user.email,
                password_hash=user.password_hash,
                is_active=user.is_active,
                created_at=user.created_at,
            )
        )

    def update_password_hash(self, user_id: UUID, password_hash: str) -> None:
        self._s.execute(
            update(UserRow).where(UserRow.id == user_id).values(password_hash=password_hash)
        )


class SqlSessionRepository:
    def __init__(self, session: OrmSession) -> None:
        self._s = session

    def add(self, session: Session) -> None:
        self._s.add(
            SessionRow(
                token_hash=session.token_hash,
                user_id=session.user_id,
                created_at=session.created_at,
                expires_at=session.expires_at,
            )
        )

    def get(self, token_hash: str) -> Session | None:
        row = self._s.get(SessionRow, token_hash)
        if row is None:
            return None
        return Session(
            token_hash=row.token_hash,
            user_id=row.user_id,
            created_at=row.created_at,
            expires_at=row.expires_at,
        )

    def delete(self, token_hash: str) -> None:
        self._s.execute(delete(SessionRow).where(SessionRow.token_hash == token_hash))

    def delete_expired(self, now: datetime) -> int:
        result = self._s.execute(delete(SessionRow).where(SessionRow.expires_at <= now))
        return int(getattr(result, "rowcount", 0) or 0)


class SqlMediaRepository:
    def __init__(self, session: OrmSession) -> None:
        self._s = session

    def add(self, media: Media) -> None:
        self._s.add(
            MediaRow(
                id=media.id,
                owner_id=media.owner_id,
                parent_id=media.parent_id,
                kind=media.kind.value,
                source=media.source.value,
                original_name=media.original_name,
                storage_key=media.storage_key,
                content_type=media.content_type,
                size_bytes=media.size_bytes,
                created_at=media.created_at,
            )
        )

    def get(self, media_id: UUID) -> Media | None:
        row = self._s.get(MediaRow, media_id)
        return _media(row) if row else None

    def list_by_owner(
        self,
        owner_id: UUID,
        kind: MediaKind | None,
        limit: int,
        offset: int,
        parent_id: UUID | None = None,
    ) -> Sequence[Media]:
        query = select(MediaRow).where(MediaRow.owner_id == owner_id)
        if kind is not None:
            query = query.where(MediaRow.kind == kind.value)
        if parent_id is not None:
            query = query.where(MediaRow.parent_id == parent_id)
        query = query.order_by(MediaRow.created_at.desc()).limit(limit).offset(offset)
        return [_media(row) for row in self._s.scalars(query)]

    def delete(self, media_id: UUID) -> None:
        # Détache explicitement les dérivés (SQLite n'applique pas toujours ON DELETE).
        self._s.execute(
            update(MediaRow).where(MediaRow.parent_id == media_id).values(parent_id=None)
        )
        self._s.execute(
            update(GenerationRow)
            .where(GenerationRow.source_media_id == media_id)
            .values(source_media_id=None)
        )
        self._s.execute(delete(MediaRow).where(MediaRow.id == media_id))


class SqlGenerationRepository:
    def __init__(self, session: OrmSession) -> None:
        self._s = session

    def add(self, generation: Generation) -> None:
        self._s.add(
            GenerationRow(
                id=generation.id,
                owner_id=generation.owner_id,
                source_media_id=generation.source_media_id,
                kind=generation.kind.value,
                status=generation.status.value,
                prompt=generation.prompt,
                parameters=generation.parameters,
                provider_task_id=generation.provider_task_id,
                error_message=generation.error_message,
                result_media_ids=[str(v) for v in generation.result_media_ids],
                created_at=generation.created_at,
                updated_at=generation.updated_at,
            )
        )

    def get(self, generation_id: UUID) -> Generation | None:
        row = self._s.get(GenerationRow, generation_id)
        return _generation(row) if row else None

    def update(self, generation: Generation) -> None:
        self._s.execute(
            update(GenerationRow)
            .where(GenerationRow.id == generation.id)
            .values(
                status=generation.status.value,
                error_message=generation.error_message,
                result_media_ids=[str(v) for v in generation.result_media_ids],
                updated_at=generation.updated_at,
                refresh_lease_until=None,
            )
        )

    def list_by_owner(
        self, owner_id: UUID, limit: int, offset: int, source_media_id: UUID | None = None
    ) -> Sequence[Generation]:
        query = select(GenerationRow).where(GenerationRow.owner_id == owner_id)
        if source_media_id is not None:
            query = query.where(GenerationRow.source_media_id == source_media_id)
        query = query.order_by(GenerationRow.created_at.desc()).limit(limit).offset(offset)
        return [_generation(row) for row in self._s.scalars(query)]

    def list_pending(self, now: datetime, limit: int) -> Sequence[Generation]:
        query = (
            select(GenerationRow)
            .where(
                GenerationRow.status.in_(_PENDING_STATUSES),
                or_(
                    GenerationRow.refresh_lease_until.is_(None),
                    GenerationRow.refresh_lease_until < now,
                ),
            )
            .order_by(GenerationRow.updated_at.asc())
            .limit(limit)
        )
        return [_generation(row) for row in self._s.scalars(query)]

    def try_lease(self, generation_id: UUID, now: datetime, until: datetime) -> bool:
        # UPDATE conditionnel : atomique sur PostgreSQL comme sur SQLite, donc un
        # seul processus obtient le bail même si plusieurs le demandent en même temps.
        result = self._s.execute(
            update(GenerationRow)
            .where(
                GenerationRow.id == generation_id,
                GenerationRow.status.in_(_PENDING_STATUSES),
                or_(
                    GenerationRow.refresh_lease_until.is_(None),
                    GenerationRow.refresh_lease_until < now,
                ),
            )
            .values(refresh_lease_until=until)
            .execution_options(synchronize_session=False)
        )
        return int(getattr(result, "rowcount", 0) or 0) == 1

    def release_lease(self, generation_id: UUID) -> None:
        self._s.execute(
            update(GenerationRow)
            .where(GenerationRow.id == generation_id)
            .values(refresh_lease_until=None)
            .execution_options(synchronize_session=False)
        )


_PENDING_STATUSES = (GenerationStatus.SUBMITTED.value, GenerationStatus.PROCESSING.value)


def _workflow(row: WorkflowRow) -> Workflow:
    return Workflow(
        id=row.id,
        owner_id=row.owner_id,
        name=row.name,
        graph=dict(row.graph or {}),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlWorkflowRepository:
    def __init__(self, session: OrmSession) -> None:
        self._s = session

    def add(self, workflow: Workflow) -> None:
        self._s.add(
            WorkflowRow(
                id=workflow.id,
                owner_id=workflow.owner_id,
                name=workflow.name,
                graph=workflow.graph,
                created_at=workflow.created_at,
                updated_at=workflow.updated_at,
            )
        )

    def get(self, workflow_id: UUID) -> Workflow | None:
        row = self._s.get(WorkflowRow, workflow_id)
        return _workflow(row) if row else None

    def update(self, workflow: Workflow) -> None:
        self._s.execute(
            update(WorkflowRow)
            .where(WorkflowRow.id == workflow.id)
            .values(name=workflow.name, graph=workflow.graph, updated_at=workflow.updated_at)
        )

    def delete(self, workflow_id: UUID) -> None:
        self._s.execute(delete(WorkflowRow).where(WorkflowRow.id == workflow_id))

    def list_by_owner(self, owner_id: UUID, limit: int, offset: int) -> Sequence[Workflow]:
        query = (
            select(WorkflowRow)
            .where(WorkflowRow.owner_id == owner_id)
            .order_by(WorkflowRow.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [_workflow(row) for row in self._s.scalars(query)]


class SqlUnitOfWork:
    """Une transaction par requête HTTP ; les dépôts partagent la même session."""

    def __init__(self, session: OrmSession) -> None:
        self._session = session
        self.users = SqlUserRepository(session)
        self.sessions = SqlSessionRepository(session)
        self.media = SqlMediaRepository(session)
        self.generations = SqlGenerationRepository(session)
        self.workflows = SqlWorkflowRepository(session)

    def commit(self) -> None:
        self._session.commit()

    def rollback(self) -> None:
        self._session.rollback()
