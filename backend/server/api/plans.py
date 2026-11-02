"""Routes des offres (``/api/plans``) : catalogue, mon offre, demande de passage Studio.

Le paiement en ligne n'est pas integre : une demande est enregistree (et
envoyee par email si le SMTP est configure), puis un administrateur active
l'offre via ``POST /api/admin/users/{username}/plan``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from server import config
from server.accounts.plans import all_plans
from server.accounts.usage import get_usage_store
from server.api.schemas import UpgradeRequestBody
from server.core.auth_deps import require_user

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/api/plans", tags=["plans"])


def plan_cards() -> list[dict]:
    """Offres presentees sur la page tarifs (memes donnees que les limites appliquees)."""
    return [
        {
            "key": plan.key,
            "label": plan.label,
            "tagline": plan.tagline,
            "price_label": plan.price_label,
            "features": list(plan.features),
            "daily_generations": plan.daily_generations,
            "qualities": list(plan.qualities),
            "max_edits_per_job": plan.max_edits_per_job,
            "max_video_seconds": plan.max_video_seconds,
        }
        for plan in all_plans().values()
    ]


@router.get("")
async def list_plans():
    """Offres disponibles (public : affiche sur la page tarifs)."""
    return {"plans": plan_cards(), "online_payment": False}


@router.get("/me")
async def my_plan(username: str = Depends(require_user)):
    """Offre et consommation du jour de l'utilisateur connecte."""
    snapshot = await run_in_threadpool(get_usage_store().snapshot, username)
    return snapshot.as_dict()


@router.post("/upgrade-request")
async def upgrade_request(body: UpgradeRequestBody, username: str = Depends(require_user)):
    """Enregistre une demande de passage a l'offre Studio."""
    request_id = await run_in_threadpool(
        get_usage_store().request_upgrade, username, body.plan, body.message
    )
    emailed = False
    if config.MAIL_USERNAME and config.MAIL_PASSWORD:
        from server.accounts.users import get_email
        from server.integrations.mailer import MailError, send_contact_email

        try:
            email = await run_in_threadpool(get_email, username)
            await send_contact_email(
                username, email, f"Demande d'offre {body.plan} (#{request_id}) : {body.message}"
            )
            emailed = True
        except MailError:
            logger.warning("Email de demande d'offre non envoyé (#%s)", request_id)
    return {
        "request_id": request_id,
        "status": "pending",
        "emailed": emailed,
        "message": "Demande enregistrée : un administrateur activera l'offre Studio.",
    }
