"""Adresse client derrière les proxys : la limitation des connexions ne doit pas
dépendre d'une valeur de X-Forwarded-For choisie par le client."""

from __future__ import annotations

import re
from pathlib import Path

import httpx
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

ENTRYPOINT = Path(__file__).resolve().parents[2] / "docker-entrypoint.sh"


def _default_trusted_proxies() -> str:
    match = re.search(r'^TRUSTED_PROXIES_DEFAULT="([^"]+)"$', ENTRYPOINT.read_text(), re.M)
    assert match, "TRUSTED_PROXIES_DEFAULT introuvable dans docker-entrypoint.sh"
    return match.group(1)


async def _client_host(request: Request) -> PlainTextResponse:
    return PlainTextResponse(request.client.host if request.client else "")


def _app(peer: str) -> httpx.AsyncClient:
    app = ProxyHeadersMiddleware(
        Starlette(routes=[Route("/", _client_host)]),
        trusted_hosts=_default_trusted_proxies(),
    )
    transport = httpx.ASGITransport(app=app, client=(peer, 40000))
    return httpx.AsyncClient(transport=transport, base_url="http://api")


def test_le_defaut_ne_fait_pas_confiance_a_tout_le_monde() -> None:
    assert "*" not in _default_trusted_proxies().split(",")


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("forwarded_for", "expected"),
    [
        # nginx (réseau Docker) ajoute l'adresse du client à droite.
        ("203.0.113.7", "203.0.113.7"),
        # Valeur forgée par le client à gauche : ignorée.
        ("1.2.3.4, 203.0.113.7", "203.0.113.7"),
        # Reverse proxy TLS sur l'hôte (passerelle Docker) puis nginx.
        ("6.6.6.6, 203.0.113.7, 172.17.0.1", "203.0.113.7"),
    ],
)
async def test_adresse_client_retenue(forwarded_for: str, expected: str) -> None:
    async with _app(peer="172.18.0.3") as client:
        response = await client.get("/", headers={"X-Forwarded-For": forwarded_for})
    assert response.text == expected


@pytest.mark.anyio
async def test_requete_directe_non_fiable_ignore_l_en_tete() -> None:
    async with _app(peer="198.51.100.20") as client:
        response = await client.get("/", headers={"X-Forwarded-For": "1.2.3.4"})
    assert response.text == "198.51.100.20"
