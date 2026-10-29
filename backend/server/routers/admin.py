"""Console d'administration du backend (page + API d'etat).

Fournit une vue d'ensemble : version, disponibilite, medias, utilisateurs,
fournisseurs de modeles, jeu d'emojis et configuration (sans secret).
"""

import logging
import platform
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from .. import config
from ..deps import require_user, require_user_page
from ..llm import get_router
from ..templating import render

logger = logging.getLogger("goldfx")

router = APIRouter(tags=["admin"])

_STARTED_AT = time.time()
_VERSION = "4.0"


def _count_files(folder: Path) -> int:
    """Compte les fichiers d'un dossier (0 si inaccessible)."""
    try:
        return sum(1 for entry in folder.iterdir() if entry.is_file())
    except OSError:
        return 0


def _count_users() -> int | None:
    """Compte les utilisateurs enregistres (None si la base est indisponible)."""
    from sqlalchemy.exc import SQLAlchemyError

    from .. import db

    try:
        return len(db.build_user_store().all())
    except (OSError, SQLAlchemyError):
        logger.exception("Lecture du nombre d'utilisateurs impossible")
        return None


async def _emoji_count() -> int | None:
    """Taille du jeu d'emojis charge (None s'il n'est pas encore charge)."""
    from ..emoji import EmojiDataError, get_dataset

    try:
        return len(await get_dataset())
    except EmojiDataError:
        return None


@router.get("/admin", name="admin")
async def admin_page(request: Request, _: str = Depends(require_user_page)):
    """Console d'administration (page HTML)."""
    return render(request, "admin.html", title="Administration", hide_search=True)


@router.get("/api/admin/overview")
async def admin_overview(_: str = Depends(require_user)):
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
    }
