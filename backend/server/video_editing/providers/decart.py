"""Adaptateur Decart Lucy (``POST /v1/jobs/lucy-2.6``, formulaire multipart).

Le fichier est envoye directement (pas besoin d'URL publique). Le resultat se
telecharge sur ``/v1/jobs/{id}/content`` avec la cle (en-tete ``X-API-KEY``).
"""

from __future__ import annotations

from pathlib import Path

from server import config
from server.core.http_clients import LazyClient
from server.video_editing.providers.base import (
    EditJobInput,
    EditProvider,
    EditProviderError,
    PollResult,
    http_error,
    request_with_retry,
)

_client = LazyClient(base_url="", timeout=300.0, retries=2)


def _headers() -> dict[str, str]:
    return {"X-API-KEY": config.DECART_API_KEY}


class DecartEditProvider(EditProvider):
    """Edition via l'API Decart."""

    name = "decart"

    async def submit(self, job: EditJobInput) -> str:
        model = job.model.endpoint.rsplit("/", 1)[-1]
        files = {"data": (job.video_path.name, job.video_path.read_bytes(), "video/mp4")}
        if job.reference_image:
            files["reference_image"] = (
                job.reference_image.name,
                job.reference_image.read_bytes(),
                "image/png",
            )
        response = await request_with_retry(
            _client.get(),
            "POST",
            f"{config.DECART_API_BASE_URL}/v1/jobs/{model}",
            "Decart",
            data={"prompt": job.prompt, "resolution": job.tier.params.get("resolution", "720p")},
            files=files,
            headers=_headers(),
        )
        job_id = str(response.json().get("job_id", ""))
        if not job_id:
            raise EditProviderError("Decart n'a pas renvoyé de job_id")
        return job_id

    async def poll(self, remote_id: str, job: EditJobInput) -> PollResult:
        base = f"{config.DECART_API_BASE_URL}/v1/jobs/{remote_id}"
        response = await request_with_retry(
            _client.get(), "GET", base, "Decart", headers=_headers()
        )
        data = response.json()
        status = data.get("status", "")
        if status == "completed":
            return PollResult("done", video_url=f"{base}/content")
        if status == "failed":
            return PollResult("failed", error=data.get("error", "Génération Decart échouée"))
        return PollResult("pending")

    async def download(self, url: str, destination: Path) -> Path:
        """Le contenu Decart exige la cle : telechargement authentifie en flux."""
        async with _client.get().stream("GET", url, headers=_headers()) as response:
            if response.status_code != 200:
                raise http_error("Decart", response.status_code)
            with destination.open("wb") as handle:
                async for chunk in response.aiter_bytes(1 << 20):
                    handle.write(chunk)
        return destination
