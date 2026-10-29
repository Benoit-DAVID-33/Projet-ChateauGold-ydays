"""Tests d'integration de la console d'administration et du prompt enhancer."""

import pytest

from server.routers import admin as admin_router


@pytest.fixture()
def fake_emoji(monkeypatch):
    """Evite tout appel reseau pour le comptage d'emojis."""

    async def _count():
        return 42

    monkeypatch.setattr(admin_router, "_emoji_count", _count)


def test_admin_page_requires_auth(client):
    assert client.get("/admin", follow_redirects=False).status_code == 303


def test_admin_page_renders(auth_client, fake_emoji):
    response = auth_client.get("/admin")
    assert response.status_code == 200
    assert "Console d'administration" in response.text
    assert "/static/css/admin.css" in response.text
    assert "/static/js/admin.js" in response.text


def test_admin_overview_requires_auth(client):
    assert client.get("/api/admin/overview").status_code == 401


def test_admin_overview_payload(auth_client, fake_emoji):
    response = auth_client.get("/api/admin/overview")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) >= {"app", "config", "media", "users", "emojis", "providers"}
    assert payload["emojis"] == 42
    assert isinstance(payload["media"]["videos"], int)
    assert isinstance(payload["providers"], list)
    assert "version" in payload["app"]


def test_prompt_enhance_requires_auth(client):
    assert client.post("/api/prompt/enhance", json={"text": "ajoute un chat"}).status_code == 401


def test_prompt_enhance_route(auth_client):
    response = auth_client.post(
        "/api/prompt/enhance", json={"text": "enlève la personne derrière", "model": "kling"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "remove"
    assert payload["source"] == "rules"
    assert payload["enhanced"]


def test_prompt_enhance_validates_input(auth_client):
    assert auth_client.post("/api/prompt/enhance", json={"text": ""}).status_code == 422
    assert (
        auth_client.post("/api/prompt/enhance", json={"text": "x", "model": "inconnu"}).status_code
        == 422
    )
