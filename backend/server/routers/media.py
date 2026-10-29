"""Routes medias : upload, service de fichiers, suppression, proxy API externe."""

import logging
import os
import subprocess
import tempfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile as StarletteUploadFile

from .. import api_client, config, media_tools
from ..deps import require_user, require_user_page
from ..forms import form_str
from ..schemas import QueryPayload

logger = logging.getLogger("goldfx")

router = APIRouter(tags=["media"])

_EXTERNAL_API_ERROR = (
    "Impossible de se connecter à l'API externe. "
    "Assurez-vous qu'elle est démarrée sur le port 5001."
)
_FFMPEG_ERROR = (
    "Conversion impossible (ffmpeg manquant ou erreur). Installez ffmpeg sur le serveur."
)
_FFMPEG_FAILURES = (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError)


def _unlink(*paths: str) -> None:
    """Supprime les fichiers temporaires indiques, en ignorant les erreurs."""
    for path in paths:
        try:
            if path and os.path.exists(path):
                os.unlink(path)
        except OSError:
            logger.warning("Nettoyage impossible : %s", path)


@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile | None = File(default=None),
    _: str = Depends(require_user_page),
):
    """Enregistre un media uploade et redirige vers la page d'edition associee."""
    referer = request.headers.get("referer") or "/"
    if file is None or not file.filename or not media_tools.allowed_file(file.filename):
        return RedirectResponse(referer, status_code=303)

    filename = media_tools.clean_filename(file.filename)
    if not filename:
        return RedirectResponse(referer, status_code=303)

    if media_tools.is_image(filename):
        folder, redirect = config.IMAGE_FOLDER, f"/image?image={quote(filename)}"
    elif media_tools.is_video(filename):
        folder, redirect = config.VIDEO_FOLDER, f"/video?video={quote(filename)}"
    else:
        return RedirectResponse(referer, status_code=303)

    data = await file.read()
    await run_in_threadpool((folder / filename).write_bytes, data)
    return RedirectResponse(redirect, status_code=303)


@router.get("/videos/{filename}", name="serve_video")
async def serve_video(filename: str):
    """Sert une video stockee, avec le bon type MIME et un cache prive."""
    path = media_tools.safe_path(config.VIDEO_FOLDER, filename)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Vidéo non trouvée")
    return FileResponse(
        str(path),
        media_type=media_tools.mimetype_for(filename),
        headers={"Cache-Control": f"private, max-age={config.MEDIA_CACHE_SECONDS}"},
    )


@router.get("/images/{filename}", name="serve_image")
async def serve_image(filename: str):
    """Sert une image stockee, avec le bon type MIME et un cache prive."""
    path = media_tools.safe_path(config.IMAGE_FOLDER, filename)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Image non trouvée")
    return FileResponse(
        str(path),
        media_type=media_tools.mimetype_for(filename),
        headers={"Cache-Control": f"private, max-age={config.MEDIA_CACHE_SECONDS}"},
    )


@router.post("/delete/{filename}")
async def delete_file(filename: str, _: str = Depends(require_user)):
    """Supprime un media (video ou image) par son nom de fichier."""
    for folder in (config.VIDEO_FOLDER, config.IMAGE_FOLDER):
        path = media_tools.safe_path(folder, filename)
        if path is not None and path.is_file():
            path.unlink()
            return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Fichier non trouvé")


async def _forward_media_to_external(filename: str, query: str, folder) -> Response:
    """Envoie un media + requete a l'API externe et sauvegarde le resultat."""
    import httpx  # import differe (voir server.http)

    path = media_tools.safe_path(folder, filename)
    if path is None or not path.is_file():
        return JSONResponse({"error": "Fichier non trouvé"}, status_code=404)

    try:
        payload = await run_in_threadpool(path.read_bytes)
        files = {"file": (filename, payload, media_tools.mimetype_for(filename))}
        response = await api_client.get_api_client().post(
            "/process-video", files=files, data={"query": query}
        )
    except httpx.HTTPError:
        return JSONResponse({"error": _EXTERNAL_API_ERROR}, status_code=503)

    if response.status_code != 200:
        return JSONResponse(
            {"error": f"Erreur API: {response.status_code}"},
            status_code=response.status_code,
        )

    processed = f"processed_{filename}"
    await run_in_threadpool((folder / processed).write_bytes, response.content)

    if media_tools.is_image(filename):
        return JSONResponse(
            {
                "status": "success",
                "message": "Image traitée avec succès",
                "processed_image": processed,
            }
        )
    return JSONResponse(
        {
            "status": "success",
            "message": "Vidéo traitée avec succès",
            "processed_video": processed,
        }
    )


@router.post("/send-to-api/{filename}")
async def send_to_api(filename: str, request: Request, _: str = Depends(require_user)):
    """Proxy d'un media vers l'API externe (avec requete texte optionnelle)."""
    query = ""
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            body = await request.json()
            query = (body or {}).get("query", "") or ""
        except ValueError:
            query = ""

    if media_tools.is_image(filename):
        return await _forward_media_to_external(filename, query, config.IMAGE_FOLDER)
    if media_tools.is_video(filename):
        return await _forward_media_to_external(filename, query, config.VIDEO_FOLDER)
    return JSONResponse({"error": "Type de fichier non supporté"}, status_code=400)


@router.post("/send-query-to-api")
async def send_query_to_api(payload: QueryPayload, _: str = Depends(require_user)):
    """Envoie une requete texte (et un media optionnel) a l'API externe."""
    import httpx  # import differe (voir server.http)

    query = payload.query or ""
    filename = payload.filename

    if not query and not filename:
        return JSONResponse({"error": "Requête vide et aucun média fourni"}, status_code=400)

    if filename and media_tools.is_image(filename):
        folder = config.IMAGE_FOLDER
    elif filename and media_tools.is_video(filename):
        folder = config.VIDEO_FOLDER
    else:
        folder = None

    client = api_client.get_api_client()
    try:
        path = media_tools.safe_path(folder, filename) if folder and filename else None
        if filename and path is not None and path.is_file():
            content = await run_in_threadpool(path.read_bytes)
            files = {"file": (filename, content, media_tools.mimetype_for(filename))}
            data = {"query": query} if query else {}
            response = await client.post("/process-video", files=files, data=data)
        else:
            response = await client.post("/process-query", json={"query": query})
    except httpx.HTTPError:
        return JSONResponse({"error": _EXTERNAL_API_ERROR}, status_code=503)

    if response.status_code != 200:
        return JSONResponse(
            {"error": f"Erreur API: {response.status_code}"},
            status_code=response.status_code,
        )
    return JSONResponse(response.json())


@router.post("/process-query")
async def process_query(request: Request, _: str = Depends(require_user)):
    """Proxy des elements annotees vers l'API externe (bouton ENVOYER de la page image)."""
    import httpx  # import differe (voir server.http)

    form = await request.form()
    upload = form.get("file")
    client = api_client.get_api_client()

    try:
        if isinstance(upload, StarletteUploadFile) and upload.filename:
            content = await upload.read()
            files = {
                "file": (
                    upload.filename,
                    content,
                    upload.content_type or "application/octet-stream",
                )
            }
            data = {"query": form_str(form, "prompt") or form_str(form, "user_intent")}
            response = await client.post("/process-video", files=files, data=data)
        else:
            query = (
                form_str(form, "prompt")
                or form_str(form, "user_intent")
                or form_str(form, "elements_json")
            )
            response = await client.post("/process-query", json={"query": query})
    except httpx.HTTPError:
        return JSONResponse({"error": _EXTERNAL_API_ERROR}, status_code=503)

    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/json"),
    )


@router.post("/api/convert-webm-to-mp4")
async def convert_webm_to_mp4(
    file: UploadFile = File(...),
    _: str = Depends(require_user),
):
    """Convertit un enregistrement WebM annote en MP4 (via FFmpeg) et le renvoie."""
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        tmp_in.write(data)
        path_in = tmp_in.name
    path_out = path_in[:-5] + ".mp4"

    try:
        await run_in_threadpool(media_tools.ffmpeg_webm_to_mp4, path_in, path_out)
    except _FFMPEG_FAILURES:
        logger.exception("Echec de la conversion WebM -> MP4")
        _unlink(path_in, path_out)
        return JSONResponse({"error": _FFMPEG_ERROR}, status_code=500)

    return FileResponse(
        path_out,
        media_type="video/mp4",
        filename="video_modifiee_annotations.mp4",
        background=BackgroundTask(_unlink, path_in, path_out),
    )
