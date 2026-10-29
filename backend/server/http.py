"""Fabrique de clients HTTP asynchrones partages (pool de connexions keep-alive).

``httpx`` est importe **a la demande** (dans ``get``), et non au niveau du
module : cela evite de charger la bibliotheque (~130 ms) au demarrage alors
qu'elle n'est utile qu'au premier appel reseau.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import httpx


class LazyClient:
    """Client httpx.AsyncClient cree a la premiere utilisation puis reutilise.

    Evite un handshake TCP/TLS par requete et mutualise les limites de
    connexions entre tous les appels d'un meme service distant.
    """

    def __init__(self, base_url: str, timeout: float, retries: int) -> None:
        self._base_url = base_url
        self._timeout = timeout
        self._retries = retries
        self._client: httpx.AsyncClient | None = None

    def get(self) -> httpx.AsyncClient:
        """Retourne le client partage, en le creant si necessaire."""
        import httpx

        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=httpx.Timeout(self._timeout, connect=10.0),
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
                transport=httpx.AsyncHTTPTransport(retries=self._retries),
            )
        return self._client

    async def aclose(self) -> None:
        """Ferme le client et libere les connexions."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
