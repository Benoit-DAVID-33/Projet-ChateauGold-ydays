"""Adaptateur Luma Ray 3.2 (``POST /v1/generations``, ``type=video_edit``).

La fidelite a la source se regle par ``video.edit.strength`` : le niveau
median (``adhere_2`` / ``flex_2`` / ``reimagine_2``) est choisi d'apres
l'intention (voir ``server.prompts.enhancer.recommended_params``).
"""

from __future__ import annotations

import base64

from server import config
from server.core.http_clients import LazyClient
from server.video_editing.providers.base import (
    EditJobInput,
    EditProvider,
    EditProviderError,
    PollResult,
    request_with_retry,
)

_client = LazyClient(base_url="", timeout=120.0, retries=2)


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {config.LUMA_API_KEY}", "Content-Type": "application/json"}


def build_body(job: EditJobInput) -> dict:
    """Corps de requete ``video_edit``."""
    if job.public_url:
        source = {"url": job.public_url, "media_type": "video/mp4"}
    else:
        encoded = base64.b64encode(job.video_path.read_bytes()).decode("ascii")
        source = {"data": encoded, "media_type": "video/mp4"}
    strength = f"{job.options.get('strength', 'adhere')}_2"
    return {
        "model": "ray-3.2",
        "type": "video_edit",
        "prompt": job.prompt[:6000],
        "source": source,
        "video": {
            "resolution": job.tier.params.get("resolution", "720p"),
            "edit": {"strength": strength, "auto_controls": True},
        },
    }


class LumaEditProvider(EditProvider):
    """Edition via l'API Luma."""

    name = "luma"

    async def submit(self, job: EditJobInput) -> str:
        response = await request_with_retry(
            _client.get(),
            "POST",
            f"{config.LUMA_API_BASE_URL}/v1/generations",
            "Luma",
            json=build_body(job),
            headers=_headers(),
        )
        generation_id = str(response.json().get("id", ""))
        if not generation_id:
            raise EditProviderError("Luma n'a pas renvoyé d'identifiant")
        return generation_id

    async def poll(self, remote_id: str, job: EditJobInput) -> PollResult:
        url = f"{config.LUMA_API_BASE_URL}/v1/generations/{remote_id}"
        response = await request_with_retry(_client.get(), "GET", url, "Luma", headers=_headers())
        data = response.json()
        state = data.get("state", "")
        if state == "completed":
            outputs = data.get("output") or []
            video_url = outputs[0].get("url", "") if outputs else ""
            if not video_url:
                return PollResult("failed", error="Luma : aucune sortie")
            return PollResult("done", video_url=video_url)
        if state == "failed":
            return PollResult("failed", error=data.get("failure_reason", "Génération Luma échouée"))
        return PollResult("pending")
