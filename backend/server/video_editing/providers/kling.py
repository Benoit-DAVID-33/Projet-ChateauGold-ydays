"""Adaptateur Kling Omni-Video (API Kling directe, ``kling-video-o1``).

Kling telecharge la video depuis une **URL publique** : le segment est expose
via ``PUBLIC_BASE_URL`` + ``/api/video-edits/files/...`` (URL a jeton non
devinable, voir ``server.api.video_edits``).
"""

from __future__ import annotations

from server.video_editing.providers.base import (
    EditJobInput,
    EditProvider,
    EditProviderError,
    PollResult,
)


class KlingEditProvider(EditProvider):
    """Edition via ``POST /v1/videos/omni-video`` (client ``server.integrations.kling_api``)."""

    name = "kling"

    async def submit(self, job: EditJobInput) -> str:
        from server.integrations import kling_api

        if not job.public_url:
            raise EditProviderError("Kling exige une URL publique (PUBLIC_BASE_URL)")
        image_list = [{"image_url": job.reference_image_url}] if job.reference_image_url else None
        try:
            payload = await kling_api.omni_video(
                prompt=job.prompt,
                video_url=job.public_url,
                image_list=image_list,
                mode=job.tier.params.get("mode", "std"),
                refer_type=job.options.get("refer_type", "base"),
            )
        except kling_api.KlingError as exc:
            raise EditProviderError(exc.message, retryable=exc.http_status >= 500) from exc
        task_id = str(payload.get("data", {}).get("task_id", ""))
        if not task_id:
            raise EditProviderError("Kling n'a pas renvoyé d'identifiant de tâche")
        return task_id

    async def poll(self, remote_id: str, job: EditJobInput) -> PollResult:
        from server.integrations import kling_api

        try:
            payload = await kling_api.get_omni_video_task(remote_id)
        except kling_api.KlingError as exc:
            if exc.http_status >= 500:
                return PollResult("pending")
            raise EditProviderError(exc.message) from exc
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        status = data.get("task_status", "")
        if status == "succeed":
            videos = data.get("task_result", {}).get("videos", [])
            url = videos[0].get("url", "") if videos else ""
            if not url:
                return PollResult("failed", error="Kling n'a renvoyé aucune vidéo")
            return PollResult("done", video_url=url)
        if status == "failed":
            message = data.get("task_status_msg", "Génération Kling échouée")
            return PollResult("failed", error=message)
        return PollResult("pending")
