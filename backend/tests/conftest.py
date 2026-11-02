"""Fixtures partagees et categorisation automatique des tests.

Les tests sont ranges par dossier (taxonomie du cours) :
``unit/``, ``integration/``, ``functional/``, ``regression/``, ``performance/``.
Le marqueur correspondant est applique automatiquement selon le dossier, ce qui
permet de lancer une categorie : ``pytest -m unit``, ``pytest -m performance``.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server import config, create_app
from server.accounts import users as security
from server.db import JsonUserStore

_MARKERS = ("unit", "integration", "functional", "regression", "performance")


def pytest_collection_modifyitems(items):
    """Applique le marqueur correspondant au dossier de chaque test."""
    for item in items:
        folders = Path(str(item.fspath)).parts
        for marker in _MARKERS:
            if marker in folders:
                item.add_marker(getattr(pytest.mark, marker))
                break


@pytest.fixture(autouse=True)
def isolated_user_store(tmp_path, monkeypatch):
    """Isole le stockage utilisateurs (fichier temporaire) pour chaque test."""
    monkeypatch.setattr(security, "_store", JsonUserStore(tmp_path / "users.json"))
    security.clear_cache()
    yield
    security.clear_cache()


@pytest.fixture(autouse=True)
def isolated_llm_router(monkeypatch):
    """Aucun appel reseau reel vers un fournisseur LLM pendant les tests.

    Le routeur partage est remplace par un routeur vide (les tests qui ont
    besoin d'un fournisseur le remplacent a leur tour via monkeypatch).
    """
    from server import proxy as llm
    from server.api import admin as admin_router
    from server.api import proxy as llm_router

    empty = llm.Router([], llm.QuotaTracker(), free_only=True)
    for module in (llm, admin_router, llm_router):
        monkeypatch.setattr(module, "get_router", lambda: empty)


@pytest.fixture(autouse=True)
def isolated_video_editing(tmp_path, monkeypatch):
    """Travaux de montage et offres isoles (dossier et base SQLite temporaires)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from server.accounts import usage
    from server.db import models  # noqa: F401  (enregistre les tables)
    from server.db.engine import Base
    from server.video_editing import service

    engine = create_engine(f"sqlite:///{(tmp_path / 'plans.db').as_posix()}")
    Base.metadata.create_all(engine)
    store = usage.UsageStore(sessionmaker(bind=engine))
    monkeypatch.setattr(config, "VIDEO_JOBS_DIR", tmp_path / "edit_jobs")
    monkeypatch.setattr(usage, "_store", store)
    monkeypatch.setattr(service, "_service", None)
    yield store
    engine.dispose()


@pytest.fixture()
def client():
    """Client de test non authentifie."""
    return TestClient(create_app())


@pytest.fixture()
def auth_client(client, monkeypatch):
    """Client de test authentifie (authentification court-circuitee)."""
    monkeypatch.setattr(security, "authenticate", lambda username, password: True)
    response = client.post(
        "/login",
        data={"username": "Château Gold", "password": "secret"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    return client


@pytest.fixture()
def media_folders(tmp_path, monkeypatch):
    """Redirige les dossiers medias vers un repertoire temporaire."""
    video = tmp_path / "videos"
    image = tmp_path / "images"
    video.mkdir()
    image.mkdir()
    monkeypatch.setattr(config, "VIDEO_FOLDER", video)
    monkeypatch.setattr(config, "IMAGE_FOLDER", image)
    return video, image


@pytest.fixture()
def kling_keys(monkeypatch):
    """Fournit des cles Kling factices pour tester la signature JWT."""
    monkeypatch.setattr(config, "KLING_ACCESS_KEY", "test-access-key")
    monkeypatch.setattr(config, "KLING_SECRET_KEY", "test-secret-key-0123456789abcdef0123456789")
