"""Fournisseur Kling AI : adapte le client existant (``server.kling``) au contrat.

L'identifiant de tache renvoye est prefixe par la capacite (``video:`` ou
``image:``) afin que le suivi sache quel endpoint interroger, sans modifier
l'interface ``Provider``.
"""

from __future__ import annotations

from .base import Capability, GenerationRequest, GenerationResult, Provider, ProviderError

_IMAGE_OPTION_KEYS = ("negative_prompt", "n", "aspect_ratio")
_VIDEO_OPTION_KEYS = ("duration", "aspect_ratio", "mode")


def _selected(options: dict, keys: tuple[str, ...]) -> dict:
    """Ne conserve que les options connues (evite les arguments inattendus)."""
    return {key: options[key] for key in keys if key in options}


def _task_status(payload: dict) -> str:
    """Extrait le statut de tache d'une reponse Kling."""
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict) and data.get("task_status"):
        return str(data["task_status"])
    return "submitted"


class KlingProvider(Provider):
    """Fournisseur de generation d'images et de videos via Kling AI."""

    name = "kling"
    capabilities = frozenset({Capability.IMAGE, Capability.VIDEO})

    async def submit(self, request: GenerationRequest) -> GenerationResult:
        """Envoie une generation d'image ou de video a Kling."""
        from .. import kling  # import local : garde le module leger au demarrage

        try:
            if request.capability is Capability.IMAGE:
                payload = await kling.generate_image(
                    request.prompt, **_selected(request.options, _IMAGE_OPTION_KEYS)
                )
            elif request.capability is Capability.VIDEO:
                payload = await kling.generate_video(
                    request.prompt, **_selected(request.options, _VIDEO_OPTION_KEYS)
                )
            else:
                raise ProviderError(
                    self.name, f"Capacité non supportée : {request.capability.value}"
                )
        except kling.KlingError as exc:
            raise ProviderError(self.name, exc.message, retryable=exc.http_status >= 500) from exc

        raw_id = str(payload.get("data", {}).get("task_id", ""))
        return GenerationResult(
            provider=self.name,
            task_id=f"{request.capability.value}:{raw_id}",
            status=_task_status(payload),
            payload=payload,
        )

    async def status(self, task_id: str) -> GenerationResult:
        """Interroge Kling sur l'etat d'une tache (image ou video)."""
        from .. import kling

        capability, _, raw_id = task_id.partition(":")
        try:
            if capability == Capability.IMAGE.value:
                payload = await kling.get_image_task(raw_id)
            elif capability == Capability.VIDEO.value:
                payload = await kling.get_video_task(raw_id)
            else:
                raise ProviderError(self.name, f"Identifiant de tâche invalide : {task_id}")
        except kling.KlingError as exc:
            raise ProviderError(self.name, exc.message, retryable=exc.http_status >= 500) from exc

        return GenerationResult(
            provider=self.name,
            task_id=task_id,
            status=_task_status(payload),
            payload=payload,
        )

    async def health(self) -> bool:
        """Teste la connexion Kling (sans consommer de credits)."""
        from .. import kling

        result = await kling.test_connection()
        return bool(result.get("ok"))
