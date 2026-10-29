"""Routes proxy vers l'API Kling AI (protegees par authentification).

Les erreurs remontees par ``server.kling`` (``KlingError``) sont converties en
reponses JSON ``{"error", "message", "code"}`` par le gestionnaire global
defini dans ``server/__init__.py``, ce qui correspond a ce que lit le frontend.
"""

import logging

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .. import config, kling
from ..deps import require_user
from ..schemas import (
    KlingImageRequest,
    KlingImageToVideoRequest,
    KlingVideoRequest,
    OmniVideoRequest,
)

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/kling", tags=["kling"], dependencies=[Depends(require_user)])

_PUBLIC_BASE_URL_ERROR = (
    "PUBLIC_BASE_URL non configurée. Lancez ngrok (ngrok http 5000) "
    "et ajoutez PUBLIC_BASE_URL=https://xxxx.ngrok.io dans le .env"
)


@router.get("/test")
async def kling_test_connection():
    """Teste la connexion a l'API Kling sans consommer de credits."""
    result = await kling.test_connection()
    return JSONResponse(result, status_code=200 if result["ok"] else 502)


@router.post("/generate-image")
async def kling_generate_image(payload: KlingImageRequest):
    """Genere une image a partir d'un prompt."""
    return await kling.generate_image(
        payload.prompt,
        negative_prompt=payload.negative_prompt,
        n=payload.n,
        aspect_ratio=payload.aspect_ratio,
    )


@router.get("/image-status/{task_id}")
async def kling_image_status(task_id: str):
    """Verifie le statut d'une tache de generation d'image."""
    return await kling.get_image_task(task_id)


@router.post("/generate-video")
async def kling_generate_video(payload: KlingVideoRequest):
    """Genere une video a partir d'un prompt (texte -> video)."""
    return await kling.generate_video(
        payload.prompt,
        duration=payload.duration,
        aspect_ratio=payload.aspect_ratio,
        mode=payload.mode,
    )


@router.get("/video-status/{task_id}")
async def kling_video_status(task_id: str):
    """Verifie le statut d'une tache de generation video."""
    return await kling.get_video_task(task_id)


@router.post("/image-to-video")
async def kling_image_to_video(payload: KlingImageToVideoRequest):
    """Genere une video a partir d'une image (image -> video)."""
    return await kling.image_to_video(
        payload.image_url,
        prompt=payload.prompt,
        duration=payload.duration,
        mode=payload.mode,
    )


@router.get("/image-to-video-status/{task_id}")
async def kling_image_to_video_status(task_id: str):
    """Verifie le statut d'une tache image-to-video."""
    return await kling.get_image2video_task(task_id)


@router.post("/omni-video")
async def kling_omni_video(payload: OmniVideoRequest):
    """Envoie une video + prompt a Kling Omni-Video pour transformation."""
    video_url = None
    if payload.filename:
        if not config.PUBLIC_BASE_URL:
            return JSONResponse({"error": _PUBLIC_BASE_URL_ERROR}, status_code=400)
        video_url = f"{config.PUBLIC_BASE_URL}/videos/{payload.filename}"

    return await kling.omni_video(
        prompt=payload.prompt,
        video_url=video_url,
        duration=payload.duration,
        mode=payload.mode,
        refer_type=payload.refer_type,
        aspect_ratio=payload.aspect_ratio,
    )


@router.get("/omni-video-status/{task_id}")
async def kling_omni_video_status(task_id: str):
    """Verifie le statut Omni-Video et telecharge la video locale si prete."""
    result = await kling.get_omni_video_task(task_id)

    task_data = result.get("data", {}) if isinstance(result, dict) else {}
    if task_data.get("task_status") == "succeed":
        videos = task_data.get("task_result", {}).get("videos", [])
        if videos:
            video_result_url = videos[0].get("url", "")
            if video_result_url:
                try:
                    response = await kling.get_client().get(video_result_url)
                    if response.status_code == 200:
                        output_filename = f"kling_{task_id}.mp4"
                        output_path = config.VIDEO_FOLDER / output_filename
                        await run_in_threadpool(output_path.write_bytes, response.content)
                        result["local_video"] = output_filename
                except httpx.HTTPError as exc:
                    logger.warning("Telechargement de la video Kling echoue : %s", exc)

    return result
