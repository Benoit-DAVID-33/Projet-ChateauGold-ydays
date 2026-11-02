"""Routes de l'edition video par IA (``/api/video-edits``).

| Methode | Chemin | Role |
| --- | --- | --- |
| GET | ``/models`` | catalogue des modeles (+ disponibilite reelle ici) |
| GET | ``/options`` | qualites reellement proposees + limites de l'offre |
| POST | ``/preview`` | plan de montage et cout estime (aucun appel payant) |
| POST | ``""`` | lance le montage (202 + travail) |
| GET | ``""`` | mes travaux |
| GET | ``/{job_id}`` | etat d'un travail |
| POST | ``/{job_id}/cancel`` | annule un travail |
| GET | ``/files/{job_id}/{token}/{name}`` | fichier de travail pour les fournisseurs |

La derniere route est **sans session** : les fournisseurs (Kling, fal, Luma)
telechargent les segments par URL. Elle est protegee par un jeton aleatoire
propre a chaque travail et n'existe que pendant le traitement.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from server import config
from server.api.schemas import VideoEditRequest
from server.core.auth_deps import require_admin, require_user
from server.video_editing import catalog
from server.video_editing.routing import provider_status
from server.video_editing.service import EditingError, EditingRequest, EditInput, get_service

router = APIRouter(prefix="/api/video-edits", tags=["video-edits"])

_SAFE_NAME = re.compile(r"^[\w.-]{1,120}$")


def _etag_json(request: Request, payload: dict, max_age: int = 300) -> Response:
    """Reponse JSON cachable : ETag + 304 si le client a deja la meme version."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    etag = f'W/"{hashlib.sha256(body).hexdigest()[:16]}"'
    headers = {"ETag": etag, "Cache-Control": f"private, max-age={max_age}"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


def _to_request(payload: VideoEditRequest) -> EditingRequest:
    return EditingRequest(
        filename=payload.filename,
        instructions=payload.instructions,
        edits=[EditInput(e.instruction, e.start, e.end) for e in payload.edits],
        quality=payload.quality,
        model=payload.model,
        use_llm=payload.use_llm,
    )


def _error(exc: EditingError, username: str = "") -> JSONResponse:
    body = {"error": exc.message, "message": exc.message}
    if exc.detail and username in config.ADMIN_USERS:
        body["detail"] = exc.detail  # diagnostic technique, jamais montre aux clients
    return JSONResponse(body, status_code=exc.status)


def _view(result, username: str) -> dict:
    """Vue utilisateur ; les administrateurs recoivent aussi le plan technique."""
    view = result.user_view()
    if username in config.ADMIN_USERS:
        view["technical"] = result.as_dict()
    return view


@router.get("/models")
async def list_models(request: Request, _: str = Depends(require_admin)):
    """Catalogue technique complet (administrateurs), avec la disponibilite reelle."""
    models = []
    for model in catalog.MODELS.values():
        reason = provider_status(model)
        models.append(
            {
                "key": model.key,
                "label": model.label,
                "vendor": model.vendor,
                "integrated": model.integrated,
                "available": reason is None,
                "unavailable_reason": reason,
                "qualities": [
                    {
                        "key": tier.key,
                        "label": tier.label,
                        "resolution": tier.resolution,
                        "price_usd_per_second": tier.price_usd_per_second,
                        "price_evidence": tier.price_evidence,
                    }
                    for tier in model.tiers
                ],
                "input": {
                    "formats": list(model.input_formats),
                    "min_seconds": model.min_seconds,
                    "max_seconds": model.max_seconds,
                    "max_megabytes": model.max_megabytes,
                    "aspect_ratios": list(model.aspect_ratios),
                },
                "time_window": model.time_window,
                "strengths": sorted(model.strengths),
                "evidence": model.evidence,
                "sources": list(model.sources),
                "notes": list(model.notes),
            }
        )
    return _etag_json(request, {"models": models})


@router.get("/options")
async def options(request: Request, username: str = Depends(require_user)):
    """Qualites proposees (sans nom de modele) et limites de l'offre de l'utilisateur."""
    service = get_service()
    snapshot = await run_in_threadpool(service.usage.snapshot, username)
    available = {m.key for m in catalog.integrated_models() if provider_status(m) is None}
    payload = {
        "qualities": catalog.public_quality_options(snapshot.plan.qualities, available),
        "usage": snapshot.as_dict(),
    }
    return _etag_json(request, payload, max_age=0)


@router.post("/preview")
async def preview(payload: VideoEditRequest, username: str = Depends(require_user)):
    """Plan de montage, modeles choisis et cout estime, sans rien lancer."""
    try:
        result = await get_service().preview(username, _to_request(payload))
    except EditingError as exc:
        return _error(exc, username)
    return _view(result, username)


@router.post("")
async def create_job(payload: VideoEditRequest, username: str = Depends(require_user)):
    """Lance le montage (le quota du jour est reserve)."""
    try:
        job, result = await get_service().submit(username, _to_request(payload))
    except EditingError as exc:
        return _error(exc, username)
    return JSONResponse({"job": job.public(), "preview": _view(result, username)}, status_code=202)


@router.get("")
async def list_jobs(username: str = Depends(require_user)):
    """Travaux de l'utilisateur."""
    return {"jobs": [job.public() for job in get_service().store.list_for(username)]}


@router.get("/files/{job_id}/{token}/{name}")
async def job_file(job_id: str, token: str, name: str):
    """Fichier intermediaire lu par un fournisseur (jeton obligatoire, sans session)."""
    job = get_service().store.get(job_id)
    if (
        job is None
        or not secrets.compare_digest(token, job.file_token)
        or not _SAFE_NAME.match(name)
    ):
        return JSONResponse({"error": "Introuvable"}, status_code=404)
    path = get_service().store.folder / job.id / name
    if job.status != "running" or not path.is_file():
        return JSONResponse({"error": "Introuvable"}, status_code=404)
    media_type = "image/png" if name.endswith(".png") else "video/mp4"
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "no-store"})


@router.get("/{job_id}")
async def job_status(job_id: str, username: str = Depends(require_user)):
    """Etat d'un travail (progression, journal, resultat)."""
    job = get_service().store.get(job_id)
    if job is None or job.username != username:
        return JSONResponse({"error": "Travail introuvable"}, status_code=404)
    return JSONResponse(job.public(), headers={"Cache-Control": "no-store"})


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, username: str = Depends(require_user)):
    """Annule un travail en attente ou en cours."""
    try:
        job = get_service().cancel(username, job_id)
    except EditingError as exc:
        return _error(exc, username)
    return job.public()
