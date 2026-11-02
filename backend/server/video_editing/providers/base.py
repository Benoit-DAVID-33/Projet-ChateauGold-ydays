"""Contrat commun des adaptateurs d'edition video (Kling, fal.ai, Decart, Luma).

Chaque adaptateur sait : **soumettre** un morceau de video + prompt, **suivre**
la generation, et **telecharger** le resultat en flux (jamais charge en
memoire en entier). ``run_edit`` enchaine les trois avec un suivi a
intervalle croissant et un delai maximal.
"""

from __future__ import annotations

import asyncio
import base64
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from server import config
from server.video_editing.catalog import QualityTier, VideoModel

_RETRY_STATUSES = {429, 500, 502, 503, 504}


class EditProviderError(Exception):
    """Echec d'une generation (message lisible, ``retryable`` si temporaire)."""

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.retryable = retryable


@dataclass
class EditJobInput:
    """Ce qui est envoye au modele pour UNE generation."""

    model: VideoModel
    tier: QualityTier
    video_path: Path
    prompt: str
    public_url: str = ""
    negative_prompt: str = ""
    reference_image: Path | None = None
    reference_image_url: str = ""
    options: dict = field(default_factory=dict)


@dataclass(frozen=True)
class PollResult:
    """Etat d'une generation distante."""

    state: str  # pending | done | failed
    video_url: str = ""
    error: str = ""


def data_uri(path: Path, media_type: str = "video/mp4") -> str:
    """Encode un fichier en data URI (accepte par fal.ai pour les petits fichiers)."""
    encoded = base64.b64encode(Path(path).read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


class EditProvider(ABC):
    """Interface d'un fournisseur d'edition video."""

    name: str = "base"

    @abstractmethod
    async def submit(self, job: EditJobInput) -> str:
        """Soumet la generation et retourne l'identifiant distant."""

    @abstractmethod
    async def poll(self, remote_id: str, job: EditJobInput) -> PollResult:
        """Retourne l'etat de la generation."""

    async def download(self, url: str, destination: Path) -> Path:
        """Telecharge le resultat en flux vers ``destination``."""
        import httpx

        async with (
            httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client,
            client.stream("GET", url, follow_redirects=True) as response,
        ):
            if response.status_code != 200:
                raise EditProviderError(
                    f"Téléchargement du résultat refusé (HTTP {response.status_code})"
                )
            with destination.open("wb") as handle:
                async for chunk in response.aiter_bytes(1 << 20):
                    handle.write(chunk)
        return destination

    async def run_edit(
        self, job: EditJobInput, destination: Path, on_submitted: Callable[[], None] | None = None
    ) -> Path:
        """Soumet, suit (intervalle croissant) puis telecharge la generation.

        on_submitted est appele des que le fournisseur a accepte la demande
        (a partir de ce moment la generation est facturee).
        """
        remote_id = await self.submit(job)
        if on_submitted is not None:
            on_submitted()
        deadline = time.monotonic() + config.VIDEO_GENERATION_TIMEOUT_SECONDS
        delay = config.VIDEO_POLL_INTERVAL_SECONDS
        while True:
            await asyncio.sleep(delay)
            result = await self.poll(remote_id, job)
            if result.state == "done":
                return await self.download(result.video_url, destination)
            if result.state == "failed":
                raise EditProviderError(result.error or f"Génération {self.name} échouée")
            if time.monotonic() > deadline:
                raise EditProviderError(f"Génération {self.name} trop longue (délai dépassé)")
            delay = min(delay * 1.5, 30.0)


def http_error(provider: str, status: int, body: str = "") -> EditProviderError:
    """Traduit un statut HTTP en erreur lisible."""
    if status in (401, 403):
        return EditProviderError(f"Clé {provider} refusée (HTTP {status})")
    if status == 402:
        return EditProviderError(f"Crédits {provider} insuffisants (HTTP 402)")
    if status == 422:
        return EditProviderError(f"Paramètres refusés par {provider} : {body[:300]}")
    return EditProviderError(
        f"Erreur {provider} (HTTP {status})", retryable=status in _RETRY_STATUSES
    )


async def request_with_retry(client, method: str, url: str, provider: str, **kwargs):
    """Requete HTTP avec 3 essais sur 429/5xx (respecte ``Retry-After``)."""
    import httpx

    response = None
    for attempt in range(3):
        try:
            response = await client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            if attempt == 2:
                raise EditProviderError(f"{provider} injoignable : {exc}", retryable=True) from exc
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        if response.status_code not in _RETRY_STATUSES or attempt == 2:
            break
        retry_after = response.headers.get("retry-after", "")
        await asyncio.sleep(
            min(float(retry_after), 15.0) if retry_after.isdigit() else 2.0 * (attempt + 1)
        )
    if response is None:
        raise EditProviderError(f"{provider} : aucune réponse")
    if response.status_code >= 400:
        raise http_error(provider, response.status_code, response.text)
    return response
