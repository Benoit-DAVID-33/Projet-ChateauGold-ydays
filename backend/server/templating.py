"""Rendu des templates Jinja2 avec compatibilite Flask.

Les templates existants utilisent des idiomes Flask :
- ``url_for('static', filename='...')`` (parametre ``filename`` au lieu de ``path``)
- ``get_flashed_messages(with_categories=true)``
- la variable de contexte ``user_email``

On fournit un shim ``url_for`` et un systeme de messages flashes adosses a la
session signee, afin de reutiliser les templates sans les modifier.

Performance : le rendu renvoie un ``ETag`` et ``Cache-Control: private, no-cache``
pour que le navigateur revalide les pages (304) au lieu de les recharger.
"""

import hashlib

from fastapi.responses import Response
from fastapi.templating import Jinja2Templates
from jinja2 import FileSystemBytecodeCache
from starlette.requests import Request

from . import config, security

templates = Jinja2Templates(directory=str(config.TEMPLATES_DIR))
templates.env.auto_reload = config.TEMPLATE_AUTO_RELOAD
_JINJA_CACHE_DIR = config.DATA_DIR / "jinja_cache"
_JINJA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
templates.env.bytecode_cache = FileSystemBytecodeCache(str(_JINJA_CACHE_DIR))


def flash(request: Request, message: str, category: str = "message") -> None:
    """Ajoute un message flash a la session (consomme au prochain rendu)."""
    request.session.setdefault("_flashes", []).append([category, message])


def get_flashed_messages(request: Request, with_categories: bool = False, category_filter=()):
    """Reproduit flask.get_flashed_messages : lit puis vide la file."""
    messages = request.session.pop("_flashes", [])
    if category_filter:
        messages = [m for m in messages if m[0] in category_filter]
    if with_categories:
        return list(messages)
    return [message for _, message in messages]


def _flask_url_for(request: Request):
    """url_for compatible Flask, retournant un chemin relatif."""

    def url_for(name: str, **params):
        if name == "static" and "filename" in params:
            params["path"] = params.pop("filename")
        url = request.url_for(name, **params)
        path = url.path
        if url.query:
            path = f"{path}?{url.query}"
        return path

    return url_for


def render(request: Request, name: str, **context):
    """Rend un template en injectant le contexte commun (utilisateur, url_for, flash)."""
    context.setdefault("title", "")
    context.setdefault("video", None)
    context.setdefault("image", None)
    context["session"] = request.session
    context["user_email"] = (
        security.get_email(request.session["username"]) if request.session.get("username") else ""
    )
    context["url_for"] = _flask_url_for(request)
    context["get_flashed_messages"] = lambda with_categories=False, category_filter=(): (
        get_flashed_messages(
            request, with_categories=with_categories, category_filter=category_filter
        )
    )
    return _with_etag(request, templates.TemplateResponse(request, name, context))


def _with_etag(request: Request, response: Response) -> Response:
    """Ajoute un ETag aux pages HTML et renvoie 304 si le client est a jour."""
    etag = '"' + hashlib.sha256(response.body).hexdigest() + '"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-cache"
    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=304, headers={"ETag": etag, "Cache-Control": "private, no-cache"}
        )
    return response
