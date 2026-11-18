from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Callable, Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from goldfx.config import Environment, Settings
from goldfx.container import Container, build_container
from goldfx.infrastructure.db.schema import Base
from goldfx.infrastructure.mail.mailers import ConsoleMailer
from goldfx.main import create_app

from .fakes import FakeGenerationProvider, FrozenClock

# Permet de jouer toute la suite contre PostgreSQL (CI) :
#   GOLDFX_TEST_DATABASE_URL=postgresql://user:pass@localhost/goldfx_test pytest
PG_URL = os.environ.get("GOLDFX_TEST_DATABASE_URL")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment=Environment.TEST,
        secret_key="test-secret-key-0123456789-abcdefghijkl",
        database_url=PG_URL or f"sqlite:///{tmp_path / 'test.db'}",
        storage_dir=tmp_path / "media",
        cookie_secure=False,
        public_base_url="https://goldfx.test",
        contact_recipient="contact@goldfx.test",
        max_image_mb=1,
        max_video_mb=2,
        login_max_attempts=5,
        _env_file=None,
    )


@pytest.fixture
def provider() -> FakeGenerationProvider:
    return FakeGenerationProvider()


@pytest.fixture
def clock() -> FrozenClock:
    return FrozenClock()


@pytest.fixture
def container(
    settings: Settings, provider: FakeGenerationProvider, clock: FrozenClock
) -> Iterator[Container]:
    base = build_container(settings)
    built = replace(base, generation_provider=provider, mailer=ConsoleMailer(), clock=clock)
    if PG_URL:
        with built.engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    Base.metadata.create_all(built.engine)
    yield built
    built.engine.dispose()


@pytest.fixture
def client(container: Container, settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings, container)
    with TestClient(app, base_url="http://testserver") as test_client:
        yield test_client


class Api:
    """Petit client métier : gère le CSRF et l'authentification."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    @property
    def csrf(self) -> str:
        token = self.client.cookies.get("goldfx_csrf")
        if not token:
            token = self.client.get("/api/auth/csrf").json()["csrf_token"]
        return str(token)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        headers = {"X-CSRF-Token": self.csrf, **kwargs.pop("headers", {})}
        return self.client.post(url, headers=headers, **kwargs)

    def delete(self, url: str) -> httpx.Response:
        return self.client.delete(url, headers={"X-CSRF-Token": self.csrf})

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.client.get(url, **kwargs)

    def signup(
        self, username: str = "alice", password: str = "motdepasse-solide"
    ) -> dict[str, Any]:
        email = f"{username}@example.com"
        r = self.post(
            "/api/auth/register",
            json={"username": username, "email": email, "password": password},
        )
        assert r.status_code == 201, r.text
        r = self.post("/api/auth/login", json={"identifier": username, "password": password})
        assert r.status_code == 200, r.text
        return dict(r.json())

    def upload(self, data: bytes, name: str = "photo.png", **form: Any) -> httpx.Response:
        return self.post("/api/media", files={"file": (name, data)}, data=form or None)


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


@pytest.fixture
def make_api(container: Container, settings: Settings) -> Iterator[Callable[[], Api]]:
    """Fabrique de clients indépendants (plusieurs utilisateurs simultanés)."""
    clients: list[TestClient] = []

    def factory() -> Api:
        tc = TestClient(create_app(settings, container), base_url="http://testserver")
        tc.__enter__()
        clients.append(tc)
        return Api(tc)

    yield factory
    for tc in clients:
        tc.__exit__(None, None, None)


@pytest.fixture(scope="session")
def webm_file(tmp_path_factory: pytest.TempPathFactory) -> Path:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg non installé")
    path = tmp_path_factory.mktemp("webm") / "clip.webm"
    command = ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i"]
    command += ["testsrc=duration=1:size=64x48:rate=10", "-c:v", "libvpx", str(path)]
    subprocess.run(command, check=True)
    return path
