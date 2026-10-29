"""Tests de l'API externe de traitement (service demo, port 5001)."""

import pytest
from fastapi.testclient import TestClient

from external_api import app


@pytest.fixture()
def api_client():
    with TestClient(app) as client:
        yield client


def test_health(api_client):
    assert api_client.get("/health").json() == {"status": "ok"}


def test_process_query(api_client):
    response = api_client.post("/process-query", json={"query": "salut"})
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_process_query_empty(api_client):
    assert api_client.post("/process-query", json={"query": "   "}).status_code == 400


def test_process_video(api_client):
    response = api_client.post(
        "/process-video",
        files={"file": ("photo.png", b"PNGDATA", "image/png")},
        data={"query": "salut"},
    )
    assert response.status_code == 200
    assert response.content == b"PNGDATA"
