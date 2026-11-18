"""Suivi des générations côté serveur : tâche de fond, bail, abandon des tâches trop anciennes."""

from __future__ import annotations

import threading
from dataclasses import dataclass, replace
from uuid import UUID

from fastapi.testclient import TestClient
from pydantic import SecretStr

from goldfx.application.generation import REFRESH_LEASE, GenerationInput
from goldfx.background import GenerationSweeper
from goldfx.config import Settings
from goldfx.container import Container
from goldfx.domain.errors import ExternalServiceError
from goldfx.domain.models import Generation, GenerationKind, GenerationStatus, User
from goldfx.domain.ports import (
    GenerationRequest,
    ProviderHealth,
    ProviderTaskState,
    UnitOfWork,
)
from goldfx.main import create_app

from ..fakes import FakeGenerationProvider, FrozenClock


def _register(container: Container, name: str) -> User:
    with container.unit_of_work() as uow:
        return container.auth_service(uow).register(name, f"{name}@example.com", "motdepasse-123")


def _create(container: Container, user: User, prompt: str = "un phare") -> str:
    with container.unit_of_work() as uow:
        generation = container.generation_service(uow).create(
            user.id, GenerationInput(GenerationKind.TEXT_TO_IMAGE, prompt=prompt)
        )
        return str(generation.id)


def _get(uow: UnitOfWork, generation_id: str) -> Generation:
    generation = uow.generations.get(UUID(generation_id))
    assert generation is not None
    return generation


def test_sweep_imports_results_for_every_user_without_any_request(
    container: Container, provider: FakeGenerationProvider
) -> None:
    alice, bob = _register(container, "alice"), _register(container, "bob")
    ids = [_create(container, alice), _create(container, bob)]
    sweeper = GenerationSweeper(container, interval_seconds=30)

    assert sweeper.run_once() == 0  # premier passage : Kling répond « en cours »
    assert sweeper.run_once() == 2  # second passage : résultats rapatriés

    with container.unit_of_work() as uow:
        for generation_id in ids:
            generation = _get(uow, generation_id)
            assert generation.status is GenerationStatus.SUCCEEDED
            assert len(generation.result_media_ids) == 1
        assert uow.generations.list_pending(container.clock.now(), 10) == []
    assert provider.downloads == 2
    assert sweeper.run_once() == 0  # plus rien à suivre


def test_lease_prevents_concurrent_refresh(
    container: Container, provider: FakeGenerationProvider, clock: FrozenClock
) -> None:
    user = _register(container, "alice")
    generation_id = _create(container, user)
    with container.unit_of_work() as uow:
        generation = _get(uow, generation_id)
        now = clock.now()
        # Un autre processus tient le bail : ni interrogation de Kling ni import.
        assert uow.generations.try_lease(generation.id, now, now + REFRESH_LEASE)
        assert not uow.generations.try_lease(generation.id, now, now + REFRESH_LEASE)
        uow.commit()
        refreshed = container.generation_service(uow).refresh(user.id, generation.id)
        assert refreshed.status is GenerationStatus.SUBMITTED
        assert provider.polls == {}
        assert uow.generations.list_pending(now, 10) == []

    # Bail expiré (processus arrêté en cours de route) : le suivi reprend.
    clock.advance(seconds=REFRESH_LEASE.total_seconds() + 1)
    assert GenerationSweeper(container, 30).run_once() == 0
    assert provider.polls == {"task-1": 1}


def test_provider_error_releases_lease_and_does_not_block_others(
    container: Container, provider: FakeGenerationProvider
) -> None:
    @dataclass
    class FlakyProvider:
        """Kling en erreur pour la première tâche seulement."""

        inner: FakeGenerationProvider

        def get_state(self, kind: GenerationKind, task_id: str) -> ProviderTaskState:
            if task_id == "task-1":
                raise ExternalServiceError("kling", "Kling indisponible")
            return self.inner.get_state(kind, task_id)

        def submit(self, request: GenerationRequest) -> str:
            return self.inner.submit(request)

        def download(self, url: str, max_bytes: int) -> tuple[bytes, str]:
            return self.inner.download(url, max_bytes)

        def check(self) -> ProviderHealth:
            return self.inner.check()

    flaky = replace(container, generation_provider=FlakyProvider(provider))
    user = _register(container, "alice")
    first, second = _create(container, user, "a"), _create(container, user, "b")

    sweeper = GenerationSweeper(flaky, 30)
    sweeper.run_once()
    assert sweeper.run_once() == 1  # la seconde aboutit malgré l'erreur sur la première

    with container.unit_of_work() as uow:
        assert _get(uow, first).status is GenerationStatus.SUBMITTED
        assert _get(uow, second).status is GenerationStatus.SUCCEEDED
        # Bail libéré après l'erreur : la première sera retentée au prochain passage.
        assert [str(g.id) for g in uow.generations.list_pending(container.clock.now(), 10)] == [
            first
        ]


def test_generation_too_old_is_abandoned(
    container: Container, provider: FakeGenerationProvider, clock: FrozenClock
) -> None:
    user = _register(container, "alice")
    generation_id = _create(container, user)
    clock.advance(hours=container.settings.generation_max_age_hours, seconds=1)

    assert GenerationSweeper(container, 30).run_once() == 1
    with container.unit_of_work() as uow:
        generation = _get(uow, generation_id)
        assert generation.status is GenerationStatus.FAILED
        assert generation.error_message is not None and "24 h" in generation.error_message
    assert provider.polls == {}


def test_sweeper_runs_with_the_app_only_when_kling_is_configured(
    container: Container, settings: Settings
) -> None:
    def sweeper_alive() -> bool:
        return any(t.name == "generation-sweeper" for t in threading.enumerate())

    with TestClient(create_app(settings, container)):
        assert not sweeper_alive()  # pas de clés Kling dans les tests

    configured = settings.model_copy(
        update={
            "kling_access_key": SecretStr("ak"),
            "kling_secret_key": SecretStr("sk"),
            "generation_sweep_seconds": 3600,
        }
    )
    with TestClient(create_app(configured, container)):
        assert sweeper_alive()
    assert not sweeper_alive()  # arrêté avec l'application
