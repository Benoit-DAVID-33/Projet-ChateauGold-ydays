"""Pages HTML (rendues cote serveur)."""

import logging

from fastapi import APIRouter, Depends, Request

from server.core.auth_deps import require_user_page
from server.core.forms import form_str
from server.core.templating import render
from server.integrations.mailer import MailError, send_contact_email

logger = logging.getLogger("goldfx")

router = APIRouter(tags=["pages"])


@router.get("/", name="index")
async def index(request: Request):
    """Page d'accueil publique (vitrine) : visible sans compte, comme /offres."""
    return render(
        request,
        "home.html",
        title="Accueil",
        video=request.query_params.get("video"),
        image=request.query_params.get("image"),
        processed_video=request.query_params.get("processed"),
        processed_image=request.query_params.get("processed_image"),
    )


@router.get("/video", name="video_page")
async def video_page(request: Request, _: str = Depends(require_user_page)):
    """Page d'edition video."""
    return render(
        request,
        "video.html",
        title="Vidéo",
        video=request.query_params.get("video"),
        image=None,
        processed_video=request.query_params.get("processed"),
    )


@router.get("/image", name="image_page")
async def image_page(request: Request, _: str = Depends(require_user_page)):
    """Page d'edition image."""
    return render(
        request,
        "image.html",
        title="Image",
        video=None,
        image=request.query_params.get("image"),
        processed_image=request.query_params.get("processed_image"),
    )


@router.get("/information", name="information")
async def information(request: Request, _: str = Depends(require_user_page)):
    """Page d'information / documentation integree."""
    return render(request, "information.html", title="Information")


@router.get("/search", name="search")
async def search(request: Request, _: str = Depends(require_user_page)):
    """Page de recherche."""
    return render(
        request, "search.html", title="Recherche", query=request.query_params.get("q", "")
    )


@router.get("/contact", name="contact")
async def contact_get(request: Request, _: str = Depends(require_user_page)):
    """Formulaire de contact."""
    return render(request, "contact.html", title="Contact", message_sent=False, error_message=None)


@router.post("/contact")
async def contact_post(request: Request, _: str = Depends(require_user_page)):
    """Traite le formulaire de contact et envoie l'email."""
    form = await request.form()
    name = form_str(form, "name").strip()
    email = form_str(form, "email").strip()
    message = form_str(form, "message").strip()

    if not (name and email and message):
        return render(
            request,
            "contact.html",
            title="Contact",
            message_sent=False,
            error_message="Veuillez remplir tous les champs.",
        )

    try:
        await send_contact_email(name, email, message)
    except MailError:
        logger.exception("Echec de l'envoi du message de contact")
        return render(
            request,
            "contact.html",
            title="Contact",
            message_sent=False,
            error_message="Erreur lors de l'envoi de l'email. Réessayez plus tard.",
        )

    return render(request, "contact.html", title="Contact", message_sent=True, error_message=None)


@router.get("/studio", name="studio")
async def studio(request: Request, _: str = Depends(require_user_page)):
    """Studio IA : timeline de modifications, assistant de prompt, suivi des montages."""
    return render(
        request,
        "studio.html",
        title="Studio IA",
        hide_search=True,
        video=request.query_params.get("video"),
    )


@router.get("/offres", name="offers")
async def offers(request: Request):
    """Offres Decouverte (gratuite) et Studio (payante), page publique."""
    from server.api.plans import plan_cards

    return render(request, "offers.html", title="Offres", hide_search=True, plans=plan_cards())
