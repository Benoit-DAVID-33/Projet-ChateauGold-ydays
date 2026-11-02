"""Console d'administration du backend (page + API d'etat).

Fournit une vue d'ensemble : version, disponibilite, medias, utilisateurs,
fournisseurs de modeles, modeles video, travaux de montage, jeu d'emojis et
configuration (sans secret).

Les actions qui modifient un compte (attribuer une offre) exigent que
l'utilisateur figure dans ``ADMIN_USERS`` (``require_admin``).
"""

import logging
import platform
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from server import config
from server.api.schemas import SetPlanBody
from server.core.auth_deps import require_admin, require_user, require_user_page
from server.core.templating import render
from server.proxy import get_router

logger = logging.getLogger("goldfx")

router = APIRouter(tags=["admin"])

_STARTED_AT = time.time()
_VERSION = "5.0"


def _count_files(folder: Path) -> int:
    """Compte les fichiers d'un dossier (0 si inaccessible)."""
    try:
        return sum(1 for entry in folder.iterdir() if entry.is_file())
    except OSError:
        return 0


def _count_users() -> int | None:
    """Compte les utilisateurs enregistres (None si la base est indisponible)."""
    from sqlalchemy.exc import SQLAlchemyError

    from server import db

    try:
        return len(db.build_user_store().all())
    except (OSError, SQLAlchemyError):
        logger.exception("Lecture du nombre d'utilisateurs impossible")
        return None


async def _emoji_count() -> int | None:
    """Taille du jeu d'emojis charge (None s'il n'est pas encore charge)."""
    from server.emoji import EmojiDataError, get_dataset

    try:
        return len(await get_dataset())
    except EmojiDataError:
        return None


@router.get("/admin", name="admin")
async def admin_page(request: Request, _: str = Depends(require_user_page)):
    """Console d'administration (page HTML)."""
    return render(request, "admin.html", title="Administration", hide_search=True)


@router.get("/api/admin/overview")
async def admin_overview(username: str = Depends(require_user)):
    """Etat complet du backend, en une requete (sans aucune donnee sensible)."""
    llm = get_router()
    users = await run_in_threadpool(_count_users)
    videos = await run_in_threadpool(_count_files, config.VIDEO_FOLDER)
    images = await run_in_threadpool(_count_files, config.IMAGE_FOLDER)
    emojis = await _emoji_count()

    return {
        "app": {
            "version": _VERSION,
            "uptime_seconds": round(time.time() - _STARTED_AT, 1),
            "python": platform.python_version(),
            "platform": platform.system(),
        },
        "config": {
            "user_store": config.USER_STORE,
            "provider_priority": config.LLM_PROVIDER_PRIORITY,
            "gzip": config.ENABLE_GZIP,
            "max_upload_mb": config.MAX_UPLOAD_MB,
            "cache_ttl_seconds": config.CACHE_TTL_SECONDS,
            "session_https_only": config.SESSION_HTTPS_ONLY,
        },
        "media": {"videos": videos, "images": images},
        "users": users,
        "emojis": emojis,
        "providers": await llm.describe(),
        "video_models": _video_models(),
        "jobs": _jobs_summary(),
        "is_admin": username in config.ADMIN_USERS,
    }


def _video_models() -> list[dict]:
    """Modeles d'edition video et leur disponibilite reelle sur ce serveur."""
    from server.video_editing.catalog import MODELS
    from server.video_editing.routing import provider_status

    return [
        {
            "key": model.key,
            "label": model.label,
            "qualities": [tier.label for tier in model.tiers],
            "available": provider_status(model) is None,
            "reason": provider_status(model),
        }
        for model in MODELS.values()
    ]


def _jobs_summary() -> dict:
    """Compteurs des travaux de montage par etat."""
    from server.video_editing.service import get_service

    service = get_service()
    counts: dict[str, int] = {}
    for job in service.store.all():
        counts[job.status] = counts.get(job.status, 0) + 1
    return {"by_status": counts, "queued_now": service.queue.pending}


@router.get("/api/admin/upgrade-requests")
async def upgrade_requests(_: str = Depends(require_admin)):
    """Demandes de passage a l'offre Studio en attente."""
    from server.accounts.usage import get_usage_store

    return {"requests": await run_in_threadpool(get_usage_store().pending_upgrades)}


@router.post("/api/admin/users/{username}/plan")
async def set_user_plan(username: str, body: SetPlanBody, admin: str = Depends(require_admin)):
    """Attribue une offre a un utilisateur et clot ses demandes en attente."""
    from server.accounts.usage import get_usage_store

    store = get_usage_store()
    plan = await run_in_threadpool(store.set_plan, username, body.plan)
    for request in await run_in_threadpool(store.pending_upgrades):
        if request["username"] == username:
            await run_in_threadpool(store.close_upgrade, request["id"], "granted")
    logger.info("Offre %s attribuée à %s par %s", plan.key, username, admin)
    return {"username": username, "plan": plan.key, "label": plan.label}


@router.get("/api/admin/jobs")
async def all_jobs(_: str = Depends(require_admin)):
    """Tous les travaux de montage (supervision)."""
    from server.video_editing.service import get_service

    return {"jobs": [job.admin_view() for job in get_service().store.all()[:200]]}
