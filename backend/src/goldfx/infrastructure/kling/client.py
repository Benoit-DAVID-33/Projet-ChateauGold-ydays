"""Adapter Kling AI pour le port ``GenerationProvider``.

Documentation de l'API : https://app.klingai.com/global/dev/document-api
Authentification : JWT HS256 signé avec la clé secrète, ``iss`` = access key.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

from goldfx.domain.errors import ConfigurationError, ExternalServiceError, RateLimitedError
from goldfx.domain.models import GenerationKind, GenerationStatus
from goldfx.domain.ports import GenerationRequest, ProviderHealth, ProviderTaskState

logger = logging.getLogger(__name__)

_PATHS: dict[GenerationKind, str] = {
    GenerationKind.TEXT_TO_IMAGE: "/v1/images/generations",
    GenerationKind.TEXT_TO_VIDEO: "/v1/videos/text2video",
    GenerationKind.IMAGE_TO_VIDEO: "/v1/videos/image2video",
    GenerationKind.OMNI_VIDEO: "/v1/videos/omni-video",
}

_STATUS: dict[str, GenerationStatus] = {
    "submitted": GenerationStatus.SUBMITTED,
    "processing": GenerationStatus.PROCESSING,
    "succeed": GenerationStatus.SUCCEEDED,
    "failed": GenerationStatus.FAILED,
}


@dataclass(frozen=True, slots=True)
class KlingConfig:
    base_url: str
    access_key: str
    secret_key: str
    image_model: str
    video_model: str
    omni_model: str
    timeout_seconds: float
    download_timeout_seconds: float


class KlingClient:
    def __init__(self, config: KlingConfig, http: httpx.Client | None = None) -> None:
        self._cfg = config
        self._http = http or httpx.Client(
            base_url=config.base_url.rstrip("/"),
            timeout=httpx.Timeout(config.timeout_seconds, connect=10.0),
            headers={"User-Agent": "goldfx/2.0"},
        )

    # ------------------------------------------------------------------ #
    # Port GenerationProvider
    # ------------------------------------------------------------------ #
    def submit(self, request: GenerationRequest) -> str:
        payload = self._payload(request)
        data = self._call("POST", _PATHS[request.kind], json=payload)
        task_id = data.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            raise ExternalServiceError("kling", "Réponse Kling sans identifiant de tâche")
        return task_id

    def get_state(self, kind: GenerationKind, task_id: str) -> ProviderTaskState:
        data = self._call("GET", f"{_PATHS[kind]}/{task_id}")
        status = _STATUS.get(str(data.get("task_status", "")), GenerationStatus.PROCESSING)
        result = data.get("task_result") or {}
        urls = [
            item["url"]
            for key in ("images", "videos")
            for item in result.get(key, []) or []
            if isinstance(item, dict) and isinstance(item.get("url"), str)
        ]
        error = data.get("task_status_msg") if status is GenerationStatus.FAILED else None
        return ProviderTaskState(status=status, result_urls=urls, error_message=error)

    def download(self, url: str, max_bytes: int) -> tuple[bytes, str]:
        # Les URLs proviennent de Kling, mais on n'autorise que l'HTTPS (anti-SSRF).
        if not url.startswith("https://"):
            raise ExternalServiceError("kling", "URL de résultat non sécurisée refusée")
        chunks: list[bytes] = []
        total = 0
        try:
            with httpx.stream(
                "GET", url, timeout=self._cfg.download_timeout_seconds, follow_redirects=True
            ) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise ExternalServiceError("kling", "Résultat trop volumineux")
                    chunks.append(chunk)
                content_type = response.headers.get("content-type", "application/octet-stream")
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                "kling", f"Téléchargement du résultat impossible : {exc}"
            ) from exc
        return b"".join(chunks), content_type

    def check(self) -> ProviderHealth:
        try:
            self._call(
                "GET", _PATHS[GenerationKind.TEXT_TO_IMAGE], params={"pageNum": 1, "pageSize": 1}
            )
        except ConfigurationError as exc:
            return ProviderHealth(ok=False, message=exc.message)
        except ExternalServiceError as exc:
            return ProviderHealth(ok=False, message=exc.message)
        return ProviderHealth(ok=True, message="Connexion à Kling réussie (authentification OK)")

    # ------------------------------------------------------------------ #
    # Interne
    # ------------------------------------------------------------------ #
    def _payload(self, req: GenerationRequest) -> dict[str, Any]:
        payload: dict[str, Any] = {"prompt": req.prompt}
        if req.negative_prompt:
            payload["negative_prompt"] = req.negative_prompt

        if req.kind is GenerationKind.TEXT_TO_IMAGE:
            payload.update(model_name=self._cfg.image_model, n=req.count)
            payload["aspect_ratio"] = req.aspect_ratio or "16:9"
        elif req.kind is GenerationKind.TEXT_TO_VIDEO:
            payload.update(
                model_name=self._cfg.video_model,
                duration=req.duration,
                mode=req.mode,
                aspect_ratio=req.aspect_ratio or "16:9",
            )
        elif req.kind is GenerationKind.IMAGE_TO_VIDEO:
            payload.update(
                model_name=self._cfg.video_model,
                image=req.image_base64,
                duration=req.duration,
                mode=req.mode,
            )
            if not req.prompt:
                payload.pop("prompt")
        elif req.kind is GenerationKind.OMNI_VIDEO:
            payload.update(model_name=self._cfg.omni_model, mode=req.mode, duration=req.duration)
            if req.aspect_ratio:
                payload["aspect_ratio"] = req.aspect_ratio
            if req.video_url:
                payload["video_list"] = [
                    {
                        "video_url": req.video_url,
                        "refer_type": req.refer_type,
                        "keep_original_sound": "yes" if req.keep_original_sound else "no",
                    }
                ]
                # En transformation (« base »), durée et format suivent la vidéo source.
                if req.refer_type == "base":
                    payload.pop("duration", None)
                    payload.pop("aspect_ratio", None)
        return payload

    def _token(self) -> str:
        if not (self._cfg.access_key and self._cfg.secret_key):
            raise ConfigurationError(
                "Kling n'est pas configuré (GOLDFX_KLING_ACCESS_KEY / GOLDFX_KLING_SECRET_KEY)"
            )
        now = int(time.time())
        claims = {"iss": self._cfg.access_key, "exp": now + 1800, "nbf": now - 5}
        return jwt.encode(claims, self._cfg.secret_key, algorithm="HS256")

    def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._token()}"}
        try:
            response = self._http.request(method, path, headers=headers, **kwargs)
        except httpx.TimeoutException as exc:
            raise ExternalServiceError("kling", "Kling ne répond pas (délai dépassé)") from exc
        except httpx.HTTPError as exc:
            raise ExternalServiceError("kling", f"Impossible de joindre Kling : {exc}") from exc

        try:
            body: dict[str, Any] = response.json()
        except ValueError:
            body = {}

        if response.status_code in (401, 403):
            raise ExternalServiceError("kling", "Authentification Kling refusée (clés invalides)")
        if response.status_code == 429:
            raise RateLimitedError("Quota Kling atteint, réessayez plus tard")
        code = body.get("code")
        if response.status_code >= 400 or (code is not None and code != 0):
            message = body.get("message") or f"HTTP {response.status_code}"
            logger.warning(
                "kling.error status=%s code=%s msg=%s", response.status_code, code, message
            )
            raise ExternalServiceError("kling", f"Erreur Kling : {message}")
        data = body.get("data")
        return data if isinstance(data, dict) else {}
