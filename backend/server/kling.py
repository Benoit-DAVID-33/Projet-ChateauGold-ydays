"""Client asynchrone de l'API Kling AI.

Toutes les operations reseau sont non bloquantes (httpx.AsyncClient) et
partagent une meme connexion persistante. L'authentification utilise un JWT
signe (HS256) regenere a chaque appel.

Gestion d'erreurs : toute defaillance (reseau, HTTP, ou code metier Kling non
nul) est traduite en ``KlingError`` porteuse d'un statut HTTP et d'un message
clair. Les reponses 429 (limite de requetes) et 5xx sur les lectures sont
reeessayees avec un delai croissant, en respectant l'en-tete ``Retry-After``.
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

from . import config
from .http import LazyClient

if TYPE_CHECKING:
    import httpx

_lazy = LazyClient(
    base_url=config.KLING_API_BASE_URL, timeout=config.KLING_TIMEOUT_SECONDS, retries=3
)

_SUCCESS_CODES: set[Any] = {None, 0}
_TEST_SUCCESS_CODES: set[Any] = {None, 0, "not_found", "RESOURCE_NOT_FOUND", "NOT_FOUND"}
_RETRY_STATUSES = {429, 500, 502, 503, 504}


class KlingError(Exception):
    """Erreur d'appel a l'API Kling (statut HTTP + code metier + message)."""

    def __init__(self, http_status: int, code: Any, message: str) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.code = code
        self.message = message


def get_client() -> httpx.AsyncClient:
    """Retourne le client partage vers l'API Kling."""
    return _lazy.get()


async def aclose() -> None:
    """Ferme le client partage (appele a l'arret de l'application)."""
    await _lazy.aclose()


def generate_jwt_token() -> str:
    """Genere un JWT d'authentification pour l'API Kling."""
    import jwt  # import differe : PyJWT n'est utile qu'au premier appel Kling

    now = int(time.time())
    payload = {
        "iss": config.KLING_ACCESS_KEY,
        "exp": now + 3600,
        "nbf": now - 5,
        "iat": now - 10,
        "jti": f"idt{int(time.time() * 1000)}",
    }
    return jwt.encode(payload, config.KLING_SECRET_KEY, algorithm="HS256")


def _safe_json(response: httpx.Response) -> dict:
    """Retourne le corps JSON de la reponse, ou un dict d'erreur lisible."""
    try:
        data = response.json()
    except ValueError:
        return {"code": response.status_code, "message": response.text[:500]}
    return (
        data
        if isinstance(data, dict)
        else {"code": response.status_code, "message": "Réponse inattendue"}
    )


def _should_retry(response: httpx.Response, method: str) -> bool:
    """Indique si l'appel doit etre reeessaye (limite de requetes ou 5xx en lecture)."""
    if response.status_code == 429:
        return True
    return method.upper() == "GET" and response.status_code in _RETRY_STATUSES


def _retry_delay(attempt: int, headers: httpx.Headers) -> float:
    """Delai avant reessai : ``Retry-After`` si fourni, sinon backoff exponentiel borne."""
    retry_after = headers.get("retry-after")
    if retry_after and retry_after.isdigit():
        return min(float(retry_after), 10.0)
    return min(0.5 * (2**attempt), 5.0)


def _http_error(status: int, data: dict) -> KlingError:
    """Traduit un statut HTTP Kling en ``KlingError`` explicite."""
    message = data.get("message") or data.get("error") or ""
    if status in (401, 403):
        return KlingError(
            502, "auth", "Authentification Kling refusée (clés invalides ou expirées)"
        )
    if status == 429:
        return KlingError(
            503, "rate_limit", "Limite de requêtes Kling atteinte, réessayez dans un instant"
        )
    if status >= 500:
        return KlingError(502, "upstream", "L'API Kling a renvoyé une erreur serveur")
    if status == 404:
        return KlingError(404, "not_found", message or "Ressource Kling introuvable")
    return KlingError(502, "http", message or f"Erreur API Kling (HTTP {status})")


async def _send_with_retry(method: str, endpoint: str, **kwargs) -> tuple[httpx.Response, dict]:
    """Envoie la requete avec reessais bornes. Leve ``KlingError`` si le transport echoue."""
    import httpx  # import differe : httpx n'est charge qu'au premier appel reseau

    headers = dict(kwargs.pop("headers", {}))
    headers["Authorization"] = f"Bearer {generate_jwt_token()}"
    headers.setdefault("Content-Type", "application/json")

    attempts = max(1, config.KLING_MAX_RETRIES)
    last: tuple[httpx.Response, dict] | None = None
    for attempt in range(attempts):
        try:
            response = await get_client().request(method, endpoint, headers=headers, **kwargs)
        except httpx.TimeoutException as exc:
            raise KlingError(504, "timeout", "Délai dépassé en contactant l'API Kling") from exc
        except httpx.HTTPError as exc:
            raise KlingError(502, "network", "Impossible de joindre l'API Kling") from exc

        last = (response, _safe_json(response))
        if attempt < attempts - 1 and _should_retry(response, method):
            await asyncio.sleep(_retry_delay(attempt, response.headers))
            continue
        break

    if last is None:  # pragma: no cover - boucle toujours renseignee
        raise KlingError(502, "network", "Aucune réponse de l'API Kling")
    return last


async def _request(method: str, endpoint: str, **kwargs) -> dict:
    """Requete Kling authentifiee. Retourne le payload en cas de succes, sinon ``KlingError``."""
    response, data = await _send_with_retry(method, endpoint, **kwargs)
    if response.status_code != 200:
        raise _http_error(response.status_code, data)
    code = data.get("code")
    if code not in _SUCCESS_CODES:
        raise KlingError(502, code, data.get("message") or "Erreur inconnue de l'API Kling")
    return data


async def test_connection() -> dict:
    """Teste l'authentification Kling sans consommer de credits."""
    if not config.KLING_ACCESS_KEY or not config.KLING_SECRET_KEY:
        return {
            "ok": False,
            "message": "Clés Kling non configurées (KLING_ACCESS_KEY / KLING_SECRET_KEY)",
        }

    try:
        response, data = await _send_with_retry(
            "GET", "/v1/images/generations/test-connection-check"
        )
    except KlingError as exc:
        return {"ok": False, "message": exc.message}

    if response.status_code in (401, 403):
        return {
            "ok": False,
            "message": "Authentification échouée (clés invalides)",
            "status": response.status_code,
            "detail": data,
        }
    if response.status_code == 200 or data.get("code") in _TEST_SUCCESS_CODES:
        return {
            "ok": True,
            "message": "Connexion API Kling réussie (authentification OK)",
            "status": response.status_code,
            "detail": data,
        }
    return {
        "ok": False,
        "message": data.get("message") or "Réponse inattendue de l'API Kling",
        "status": response.status_code,
        "detail": data,
    }


async def generate_image(
    prompt: str,
    negative_prompt: str = "",
    model: str = "kling-v1",
    n: int = 1,
    aspect_ratio: str = "16:9",
) -> dict:
    """Genere une image via l'API Kling (POST /v1/images/generations)."""
    payload = {"model": model, "prompt": prompt, "n": n, "aspect_ratio": aspect_ratio}
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt
    return await _request("POST", "/v1/images/generations", json=payload)


async def get_image_task(task_id: str) -> dict:
    """Retourne le statut d'une tache de generation d'image."""
    return await _request("GET", f"/v1/images/generations/{task_id}")


async def generate_video(
    prompt: str,
    model: str = "kling-v1",
    duration: str = "5",
    aspect_ratio: str = "16:9",
    mode: str = "std",
) -> dict:
    """Genere une video a partir d'un prompt (POST /v1/videos/text2video)."""
    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "mode": mode,
    }
    return await _request("POST", "/v1/videos/text2video", json=payload)


async def get_video_task(task_id: str) -> dict:
    """Retourne le statut d'une tache text-to-video."""
    return await _request("GET", f"/v1/videos/text2video/{task_id}")


async def image_to_video(
    image_url: str,
    prompt: str = "",
    model: str = "kling-v1",
    duration: str = "5",
    mode: str = "std",
) -> dict:
    """Genere une video a partir d'une image (POST /v1/videos/image2video)."""
    payload = {"model": model, "image": image_url, "duration": duration, "mode": mode}
    if prompt:
        payload["prompt"] = prompt
    return await _request("POST", "/v1/videos/image2video", json=payload)


async def get_image2video_task(task_id: str) -> dict:
    """Retourne le statut d'une tache image-to-video."""
    return await _request("GET", f"/v1/videos/image2video/{task_id}")


async def omni_video(
    prompt: str,
    video_url: str | None = None,
    image_list: list | None = None,
    duration: str = "5",
    mode: str = "pro",
    aspect_ratio: str | None = None,
    model_name: str = "kling-video-o1",
    refer_type: str = "base",
) -> dict:
    """Endpoint Omni-Video de Kling (transformation, text-to-video, image-to-video)."""
    payload: dict[str, object] = {
        "model_name": model_name,
        "prompt": prompt,
        "mode": mode,
        "duration": duration,
    }
    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio
    if video_url:
        payload["video_list"] = [
            {
                "video_url": video_url,
                "refer_type": refer_type,
                "keep_original_sound": "yes",
            }
        ]
        if refer_type == "base":
            payload.pop("duration", None)
            payload.pop("aspect_ratio", None)
    if image_list:
        payload["image_list"] = image_list
    return await _request("POST", "/v1/videos/omni-video", json=payload)


async def get_omni_video_task(task_id: str) -> dict:
    """Retourne le statut d'une tache Omni-Video."""
    return await _request("GET", f"/v1/videos/omni-video/{task_id}")
