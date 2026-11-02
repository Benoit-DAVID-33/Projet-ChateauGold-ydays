"""Adaptateur GRATUIT : Space Hugging Face « JoyAI Video Edit » (ZeroGPU, API Gradio).

Garanties :

- **aucun jeton** n'est envoye (ni en-tete ``Authorization``, ni ``HF_TOKEN``) :
  l'appel est anonyme, aucun compte Hugging Face n'est utilise ni debite ;
- le quota GPU anonyme (~2 min/jour pour l'IP du serveur) est suivi localement
  (``SpaceBudget``) : on refuse une generation qui depasserait le reste du jour
  plutot que d'echouer au milieu d'un montage.

Protocole Gradio (verifie sur le Space le 2026-11-02) :

1. ``POST {space}/gradio_api/upload`` (multipart ``files``) -> chemins serveur ;
2. ``POST {space}/gradio_api/call/<endpoint>`` ``{"data": [...]}`` -> ``event_id`` ;
3. ``GET  {space}/gradio_api/call/<endpoint>/<event_id>`` : flux SSE jusqu'a
   ``event: complete`` (sortie ``[apercu, video, statut]``) ou ``event: error``.

Le nom de l'endpoint (``/edit_video_1`` aujourd'hui) est lu dans
``/gradio_api/info`` au lieu d'etre code en dur.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

from server import config
from server.video_editing.providers.base import (
    EditJobInput,
    EditProvider,
    EditProviderError,
    PollResult,
)

logger = logging.getLogger("goldfx")

_FPS = 24
_FRAMES_PER_CHUNK = 8
_QUOTA_WORDS = ("quota", "exceeded", "gpu task aborted", "no gpu", "zerogpu")


def space_url(space_id: str) -> str:
    """URL publique d'un Space (``owner/nom`` -> ``https://owner-nom.hf.space``)."""
    slug = space_id.replace("/", "-").replace("_", "-").replace(".", "-").lower()
    return f"https://{slug}.hf.space"


def estimate_gpu_seconds(seconds: float) -> float:
    """Quota GPU reserve par le Space pour un passage (meme formule que son code)."""
    frames = max(1, round(seconds * _FPS))
    chunks = 1 + (frames - 1) // _FRAMES_PER_CHUNK
    return float(min(120.0, 15 + chunks * 2 * 1.1))


class SpaceBudget:
    """Quota GPU anonyme du jour (UTC), persiste sur disque."""

    def __init__(self, path: Path | None = None, limit: float | None = None) -> None:
        self._path = Path(path or config.HF_SPACE_BUDGET_FILE)
        self._limit = config.HF_SPACE_DAILY_GPU_SECONDS if limit is None else limit
        self._lock = threading.Lock()

    @staticmethod
    def _today() -> str:
        return datetime.now(UTC).date().isoformat()

    def _read(self) -> dict:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"day": self._today(), "used": 0.0}
        if not isinstance(data, dict) or data.get("day") != self._today():
            return {"day": self._today(), "used": 0.0}
        return data

    def _write(self, data: dict) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(data), encoding="utf-8")
        except OSError:
            logger.warning("Quota du Space non enregistré : %s", self._path)

    def remaining(self) -> float:
        """Secondes de GPU encore disponibles aujourd'hui."""
        with self._lock:
            return max(0.0, self._limit - float(self._read().get("used", 0.0)))

    def consume(self, seconds: float) -> None:
        """Decompte une generation envoyee au Space."""
        with self._lock:
            data = self._read()
            data["used"] = float(data.get("used", 0.0)) + seconds
            self._write(data)

    def mark_exhausted(self) -> None:
        """Le Space a signale un quota depasse : plus rien jusqu'a demain."""
        with self._lock:
            self._write({"day": self._today(), "used": self._limit})


_budget: SpaceBudget | None = None


def get_budget() -> SpaceBudget:
    """Compteur partage (cree au premier usage)."""
    global _budget  # pylint: disable=global-statement
    if _budget is None:
        _budget = SpaceBudget()
    return _budget


def _final_video_url(output: list) -> str:
    """URL de la video dans la sortie ``[apercu, video, statut]`` du Space."""
    for item in output:
        if isinstance(item, dict):
            nested = item.get("video")
            video: dict = nested if isinstance(nested, dict) else item
            url = str(video.get("url") or "")
            if url.endswith((".mp4", ".webm", ".mov")):
                return url
    return ""


def _error_message(raw: str) -> str:
    try:
        data = json.loads(raw)
    except ValueError:
        data = raw
    if isinstance(data, dict):
        return str(data.get("error") or data.get("message") or data)
    return str(data or "erreur inconnue")


class HfSpaceEditProvider(EditProvider):
    """Edition gratuite via le Space JoyAI Video Edit (appel anonyme)."""

    name = "hf_space"

    def __init__(self) -> None:
        self._endpoint: tuple[str, float] | None = None

    @property
    def base_url(self) -> str:
        """URL du Space configure."""
        return space_url(config.HF_SPACE_ID)

    @staticmethod
    def _client(timeout: float = 120.0):
        import httpx

        # Aucun en-tete d'authentification : appel anonyme volontaire.
        return httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=20.0), follow_redirects=True, trust_env=False
        )

    async def endpoint(self) -> str:
        """Nom de l'endpoint d'edition, lu dans ``/gradio_api/info`` (cache 10 min)."""
        if self._endpoint and time.monotonic() - self._endpoint[1] < 600:
            return self._endpoint[0]
        async with self._client(30.0) as client:
            response = await client.get(f"{self.base_url}/gradio_api/info")
        if response.status_code != 200:
            raise EditProviderError(
                f"Démonstration gratuite indisponible (Space HTTP {response.status_code})",
                retryable=True,
            )
        named = response.json().get("named_endpoints", {})
        for name, spec in named.items():
            params = {p.get("parameter_name") for p in spec.get("parameters", [])}
            wanted = name.startswith(config.HF_SPACE_ENDPOINT_PREFIX) and not name.endswith(
                "_submit"
            )
            if wanted and {"video_path", "instruction"} <= params:
                self._endpoint = (name.lstrip("/"), time.monotonic())
                return self._endpoint[0]
        raise EditProviderError("Le Space ne propose plus l'endpoint d'édition attendu")

    async def submit(self, job: EditJobInput) -> str:
        from server.media import ffmpeg

        info = await asyncio.to_thread(ffmpeg.probe, job.video_path)
        seconds = min(job.model.max_seconds or 4.0, max(0.5, info.duration))
        cost = estimate_gpu_seconds(seconds)
        budget = get_budget()
        if budget.remaining() < cost:
            raise EditProviderError(
                "La démonstration gratuite a atteint sa limite du jour. Réessayez demain."
            )
        endpoint = await self.endpoint()
        async with self._client() as client:
            upload = await client.post(
                f"{self.base_url}/gradio_api/upload",
                files={"files": (job.video_path.name, job.video_path.read_bytes(), "video/mp4")},
            )
            if upload.status_code != 200:
                raise EditProviderError(
                    f"Envoi de la vidéo refusé par le Space (HTTP {upload.status_code})",
                    retryable=upload.status_code >= 500,
                )
            server_path = upload.json()[0]
            payload = {
                "data": [
                    {"path": server_path, "meta": {"_type": "gradio.FileData"}},
                    job.prompt,
                    round(seconds, 2),
                    42,
                    False,
                    2,
                    None,
                ]
            }
            call = await client.post(f"{self.base_url}/gradio_api/call/{endpoint}", json=payload)
        if call.status_code != 200 or "event_id" not in call.json():
            raise EditProviderError(
                f"Le Space n'a pas accepté la demande (HTTP {call.status_code})",
                retryable=call.status_code in {429, 500, 502, 503},
            )
        budget.consume(cost)
        return json.dumps({"endpoint": endpoint, "event_id": call.json()["event_id"]})

    async def poll(self, remote_id: str, job: EditJobInput) -> PollResult:
        """Lit le flux SSE jusqu'a la fin (le Space renvoie la video d'un bloc)."""
        ids = json.loads(remote_id)
        url = f"{self.base_url}/gradio_api/call/{ids['endpoint']}/{ids['event_id']}"
        event, data = "", ""
        async with (
            self._client(config.HF_SPACE_TIMEOUT_SECONDS) as client,
            client.stream("GET", url) as stream,
        ):
            async for line in stream.aiter_lines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data = line[5:].strip()
                    if event in {"complete", "error"}:
                        break
        if event == "complete":
            output = json.loads(data) if data else []
            video_url = _final_video_url(output if isinstance(output, list) else [])
            if video_url:
                return PollResult("done", video_url=video_url)
            return PollResult("failed", error="Le Space n'a renvoyé aucune vidéo")
        if not event:
            return PollResult("failed", error="Le Space a interrompu la génération")
        message = _error_message(data)
        if any(word in message.lower() for word in _QUOTA_WORDS):
            get_budget().mark_exhausted()
            return PollResult(
                "failed", error="La démonstration gratuite a atteint sa limite du jour."
            )
        return PollResult("failed", error=f"Démonstration gratuite : {message[:200]}")
