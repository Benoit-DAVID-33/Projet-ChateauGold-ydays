"""Client HTTP asynchrone partage vers l'API externe de traitement.

Un seul AsyncClient reutilise (pool de connexions keep-alive) au lieu d'un
client par requete : moins de handshakes TCP/TLS, meilleure latence.
``httpx`` est importe a la demande (voir ``server.http``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from . import config
from .http import LazyClient

if TYPE_CHECKING:
    import httpx

_lazy = LazyClient(base_url=config.API_BASE_URL, timeout=300.0, retries=2)


def get_api_client() -> httpx.AsyncClient:
    """Retourne le client partage vers l'API externe."""
    return _lazy.get()


async def aclose() -> None:
    """Ferme le client partage (appele a l'arret de l'application)."""
    await _lazy.aclose()
