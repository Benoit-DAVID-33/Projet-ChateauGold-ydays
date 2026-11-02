"""Adaptateur fal.ai (file d'attente HTTP) : Kling O3 Edit et LTX 2.3 Retake.

API de file d'attente (documentation fal) :

- ``POST {FAL_QUEUE_URL}/{endpoint}`` avec ``Authorization: Key <cle>`` ;
- la reponse donne ``status_url`` (``IN_QUEUE`` / ``IN_PROGRESS`` /
  ``COMPLETED``) et ``response_url`` (sortie ``{"video": {"url": ...}}``).

La video est passee par URL publique si ``PUBLIC_BASE_URL`` est defini, sinon
en data URI (accepte par fal pour les entrees fichier).
"""

from __future__ import annotations

import json

from server import config
from server.core.http_clients import LazyClient
from server.video_editing.providers.base import (
    EditJobInput,
    EditProvider,
    EditProviderError,
    PollResult,
    data_uri,
    request_with_retry,
)

_client = LazyClient(base_url="", timeout=120.0, retries=2)


def _headers() -> dict[str, str]:
    return {"Authorization": f"Key {config.FAL_API_KEY}", "Content-Type": "application/json"}


def build_input(job: EditJobInput) -> dict:
    """Corps de requete propre au modele (Kling O3 Edit ou LTX Retake)."""
    video = job.public_url or data_uri(job.video_path)
    if job.model.time_window:
        return {
            "prompt": job.prompt,
            "video_url": video,
            "start_time": round(float(job.options.get("start_time", 0.0)), 3),
            "duration": round(float(job.options.get("duration", 5.0)), 3),
            "retake_mode": "replace_video",
        }
    body: dict = {"prompt": job.prompt, "video_url": video, "keep_audio": False}
    reference = job.reference_image_url or (
        data_uri(job.reference_image, "image/png") if job.reference_image else ""
    )
    if reference:
        body["image_urls"] = [reference]
    return body


class FalEditProvider(EditProvider):
    """Edition via la file d'attente fal.ai."""

    name = "fal"

    async def _get(self, url: str) -> dict:
        response = await request_with_retry(_client.get(), "GET", url, "fal.ai", headers=_headers())
        return response.json()

    async def submit(self, job: EditJobInput) -> str:
        endpoint = job.tier.params.get("endpoint") or job.model.endpoint
        response = await request_with_retry(
            _client.get(),
            "POST",
            f"{config.FAL_QUEUE_URL}/{endpoint}",
            "fal.ai",
            json=build_input(job),
            headers=_headers(),
        )
        data = response.json()
        if not data.get("status_url") or not data.get("response_url"):
            raise EditProviderError("Réponse fal.ai inattendue (URLs de suivi absentes)")
        return json.dumps({"status": data["status_url"], "result": data["response_url"]})

    async def poll(self, remote_id: str, job: EditJobInput) -> PollResult:
        urls = json.loads(remote_id)
        status = await self._get(urls["status"])
        if status.get("status") != "COMPLETED":
            return PollResult("pending")
        if status.get("error"):
            return PollResult("failed", error=f"fal.ai : {status['error']}")
        result = await self._get(urls["result"])
        url = (result.get("video") or {}).get("url", "")
        if not url:
            return PollResult("failed", error="fal.ai n'a renvoyé aucune vidéo")
        return PollResult("done", video_url=url)
