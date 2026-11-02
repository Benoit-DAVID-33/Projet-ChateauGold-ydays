"""Routes proxy vers l'API Kling AI (protegees par authentification).

Les erreurs remontees par ``server.integrations.kling_api`` (``KlingError``) sont converties en
reponses JSON ``{"error", "message", "code"}`` par le gestionnaire global
defini dans ``server/__init__.py``, ce qui correspond a ce que lit le frontend.
"""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from server import config
from server.api.schemas import (
    KlingImageRequest,
    KlingImageToVideoRequest,
    KlingVideoRequest,
    OmniVideoRequest,
)
from server.core.auth_deps import require_user
from server.integrations import kling_api
from server.prompts import enhancer

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/kling", tags=["kling"], dependencies=[Depends(require_user)])

_PUBLIC_BASE_URL_ERROR = (
    "PUBLIC_BASE_URL non configurée. Lancez ngrok (ngrok http 5000) "
    "et ajoutez PUBLIC_BASE_URL=https://xxxx.ngrok.io dans le .env"
)


@router.get("/test")
async def kling_test_connection():
    """Teste la connexion a l'API Kling sans consommer de credits."""
    result = await kling_api.test_connection()
    return JSONResponse(result, status_code=200 if result["ok"] else 502)


@router.post("/generate-image")
async def kling_generate_image(payload: KlingImageRequest):
    """Genere une image a partir d'un prompt."""
    return await kling_api.generate_image(
        payload.prompt,
        negative_prompt=payload.negative_prompt,
        n=payload.n,
        aspect_ratio=payload.aspect_ratio,
    )


@router.get("/image-status/{task_id}")
async def kling_image_status(task_id: str):
    """Verifie le statut d'une tache de generation d'image."""
    return await kling_api.get_image_task(task_id)


@router.post("/generate-video")
async def kling_generate_video(payload: KlingVideoRequest):
    """Genere une video a partir d'un prompt (texte -> video)."""
    return await kling_api.generate_video(
        payload.prompt,
        duration=payload.duration,
        aspect_ratio=payload.aspect_ratio,
        mode=payload.mode,
    )


@router.get("/video-status/{task_id}")
async def kling_video_status(task_id: str):
    """Verifie le statut d'une tache de generation video."""
    return await kling_api.get_video_task(task_id)


@router.post("/image-to-video")
async def kling_image_to_video(payload: KlingImageToVideoRequest):
    """Genere une video a partir d'une image (image -> video)."""
    return await kling_api.image_to_video(
        payload.image_url,
        prompt=payload.prompt,
        duration=payload.duration,
        mode=payload.mode,
    )


@router.get("/image-to-video-status/{task_id}")
async def kling_image_to_video_status(task_id: str):
    """Verifie le statut d'une tache image-to-video."""
    return await kling_api.get_image2video_task(task_id)


async def _prepare_omni_prompt(payload: OmniVideoRequest) -> tuple[str, str, dict | None]:
    """Convertit la demande naturelle en prompt Kling Omni (prompt, refer_type, details).

    La conversion est sautee si elle est desactivee ou si le prompt est deja
    structure (reference ``<<<video_1>>>``). Une demande en plusieurs
    modifications n'envoie que la premiere etape (les suivantes sont renvoyees).
    Le ``refer_type`` conseille n'est applique que s'il n'a pas ete fourni.
    """
    auto = config.PROMPT_AUTO_ENHANCE if payload.auto_prompt is None else payload.auto_prompt
    if not auto or not payload.filename or enhancer.is_engineered(payload.prompt):
        return payload.prompt, payload.refer_type, None

    result = await enhancer.enhance(payload.prompt, model="kling", use_llm=True)
    refer_type = payload.refer_type
    if "refer_type" not in payload.model_fields_set:
        refer_type = result.params.get("refer_type", refer_type)
    details = {
        "original": result.original,
        "used": result.enhanced,
        "source": result.source,
        "intent": result.intent,
        "language": result.language,
        "remaining_steps": [step.prompt for step in result.steps[1:]],
    }
    return result.enhanced, refer_type, details


@router.post("/omni-video")
async def kling_omni_video(payload: OmniVideoRequest):
    """Envoie une video + prompt a Kling Omni-Video pour transformation.

    Par defaut (``PROMPT_AUTO_ENHANCE``), la demande en langage naturel est
    convertie automatiquement en prompt Kling structure ; le prompt reellement
    envoye est renvoye dans ``prompt_conversion``.
    """
    video_url = None
    if payload.filename:
        if not config.PUBLIC_BASE_URL:
            return JSONResponse({"error": _PUBLIC_BASE_URL_ERROR}, status_code=400)
        video_url = f"{config.PUBLIC_BASE_URL}/videos/{payload.filename}"

    prompt, refer_type, conversion = await _prepare_omni_prompt(payload)
    result = await kling_api.omni_video(
        prompt=prompt,
        video_url=video_url,
        duration=payload.duration,
        mode=payload.mode,
        refer_type=refer_type,
        aspect_ratio=payload.aspect_ratio,
    )
    if conversion is not None and isinstance(result, dict):
        result["prompt_conversion"] = conversion
    return result


async def _download(url: str, destination) -> None:
    """Telecharge en flux vers un fichier temporaire puis le renomme (jamais tout en memoire)."""
    temporary = destination.with_suffix(".part")
    async with kling_api.get_client().stream("GET", url) as response:
        if response.status_code != 200:
            return
        with temporary.open("wb") as handle:
            async for chunk in response.aiter_bytes(1 << 20):
                handle.write(chunk)
    temporary.replace(destination)


@router.get("/omni-video-status/{task_id}")
async def kling_omni_video_status(task_id: str):
    """Verifie le statut Omni-Video et telecharge la video locale si prete."""
    import httpx  # import differe (voir server.core.http_clients)

    result = await kling_api.get_omni_video_task(task_id)

    task_data = result.get("data", {}) if isinstance(result, dict) else {}
    if task_data.get("task_status") == "succeed":
        videos = task_data.get("task_result", {}).get("videos", [])
        if videos:
            video_result_url = videos[0].get("url", "")
            if video_result_url:
                output_filename = f"kling_{task_id}.mp4"
                output_path = config.VIDEO_FOLDER / output_filename
                if output_path.is_file() and output_path.stat().st_size > 0:
                    result["local_video"] = (
                        output_filename  # deja telechargee : pas de 2e transfert
                    )
                else:
                    try:
                        await _download(video_result_url, output_path)
                        result["local_video"] = output_filename
                    except httpx.HTTPError as exc:
                        logger.warning("Telechargement de la video Kling echoue : %s", exc)

    return result
