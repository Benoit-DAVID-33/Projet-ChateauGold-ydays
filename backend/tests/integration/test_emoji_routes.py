"""Tests d'integration des routes du studio emoji (/api/emoji/*)."""

import pytest

from server.routers import emoji as emoji_router

DATASET = [
    {
        "emoji": "🚗",
        "label_fr": "voiture",
        "label_en": "automobile",
        "tags_fr": ["véhicule"],
        "tags_en": ["car"],
        "shortcodes": [":car:"],
    },
    {
        "emoji": "✈️",
        "label_fr": "avion",
        "label_en": "airplane",
        "tags_fr": ["vol"],
        "tags_en": ["plane"],
        "shortcodes": [],
    },
]


@pytest.fixture()
def fake_dataset(monkeypatch):
    """Remplace le jeu emojibase par une fixture (aucun reseau)."""

    async def _dataset():
        return DATASET

    monkeypatch.setattr(emoji_router, "get_dataset", _dataset)
    return DATASET


def test_search_route(auth_client, fake_dataset):
    response = auth_client.get("/api/emoji/search", params={"q": "voiture"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["results"][0]["emoji"] == "🚗"


def test_search_route_empty_query(auth_client, fake_dataset):
    response = auth_client.get("/api/emoji/search", params={"q": ""})
    assert response.status_code == 200
    assert response.json()["count"] == 0


def test_plan_route_from_prompt(auth_client, fake_dataset):
    response = auth_client.post("/api/emoji/plan", json={"prompt": "2 voitures et un avion"})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["layers"]) == 2
    assert payload["layers"][0]["quantity"] == 2
    assert payload["layers"][1]["emoji"] == "✈️"


def test_plan_route_from_emoji_list(auth_client, fake_dataset):
    response = auth_client.post("/api/emoji/plan", json={"emojis": ["🚗", "✈️"]})
    assert response.status_code == 200
    assert len(response.json()["layers"]) == 2


def test_plan_route_without_input(auth_client, fake_dataset):
    response = auth_client.post("/api/emoji/plan", json={})
    assert response.status_code == 200
    assert response.json()["layers"] == []


def test_plan_route_is_deterministic(auth_client, fake_dataset):
    body = {"prompt": "3 voitures", "seed": 5}
    first = auth_client.post("/api/emoji/plan", json=body).json()
    second = auth_client.post("/api/emoji/plan", json=body).json()
    assert first == second


def test_dataset_route(auth_client, fake_dataset):
    response = auth_client.get("/api/emoji/dataset")
    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_emoji_routes_require_auth(client):
    assert client.get("/api/emoji/search", params={"q": "voiture"}).status_code == 401


def test_search_route_when_data_unavailable(auth_client, monkeypatch):
    from server.emoji import EmojiDataError

    async def _boom():
        raise EmojiDataError("indisponible")

    monkeypatch.setattr(emoji_router, "get_dataset", _boom)
    response = auth_client.get("/api/emoji/search", params={"q": "voiture"})
    assert response.status_code == 503
    assert "error" in response.json()
