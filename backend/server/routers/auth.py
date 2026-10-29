"""Authentification : connexion, inscription, deconnexion."""

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from .. import security
from ..forms import form_str
from ..templating import flash, render

router = APIRouter(tags=["auth"])


def _safe_next(next_page: str | None) -> str:
    """Empeche les redirections ouvertes : seuls les chemins relatifs internes."""
    if next_page and next_page.startswith("/") and not next_page.startswith("//"):
        return next_page
    return "/"


@router.get("/login", name="login")
async def login_get(request: Request):
    """Affiche le formulaire de connexion (ou redirige si deja connecte)."""
    if request.session.get("username"):
        return RedirectResponse("/", status_code=303)
    return render(request, "login.html", title="Connexion")


@router.post("/login")
async def login_post(request: Request):
    """Valide les identifiants et ouvre la session, ou reaffiche le formulaire."""
    form = await request.form()
    username = form_str(form, "username").strip()
    password = form_str(form, "password")

    if security.authenticate(username, password):
        request.session["username"] = username
        return RedirectResponse(_safe_next(request.query_params.get("next")), status_code=303)

    flash(request, "Identifiants incorrects", "error")
    return render(request, "login.html", title="Connexion")


@router.get("/register", name="register")
async def register_get(request: Request):
    """Affiche le formulaire d'inscription (ou redirige si deja connecte)."""
    if request.session.get("username"):
        return RedirectResponse("/", status_code=303)
    return render(request, "register.html", title="Inscription")


@router.post("/register")
async def register_post(request: Request):
    """Cree un compte utilisateur puis redirige vers la connexion."""
    form = await request.form()
    username = form_str(form, "username").strip()
    email = form_str(form, "email").strip()
    password = form_str(form, "password")

    if not username or not email or not password:
        flash(request, "Veuillez remplir tous les champs", "error")
        return render(request, "register.html", title="Inscription")

    ok, message = security.create_user(username, email, password)
    if not ok:
        flash(request, message, "error")
        return render(request, "register.html", title="Inscription")

    flash(request, message, "success")
    return RedirectResponse("/login", status_code=303)


@router.get("/logout", name="logout")
async def logout(request: Request):
    """Ferme la session et redirige vers la connexion."""
    request.session.pop("username", None)
    return RedirectResponse("/login", status_code=303)
