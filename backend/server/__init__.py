"""Application FastAPI GOLD FX (ASGI) - point d'assemblage.

Carte rapide du paquet ``server`` :

- ``config``      : configuration (variables d'environnement, chemins).
- ``caching``     : cache memoire, compression gzip selective, cache statique.
- ``security``    : facade utilisateurs (hachage + authentification).
- ``db``          : persistance SQLAlchemy (modele, repository, seed).
- ``deps``        : dependances d'authentification (401 / redirection).
- ``schemas``     : modeles Pydantic des corps de requete.
- ``forms``       : lecture typee des champs de formulaire.
- ``http``        : fabrique de clients HTTP asynchrones partages.
- ``kling``       : client async de l'API Kling (JWT + erreurs typees).
- ``llm``         : proxy multi-fournisseurs (routeur, quotas, providers).
- ``emoji``       : studio emoji backend (donnees, recherche, plan de calques).
- ``mailer``      : envoi d'emails SMTP dans un thread.
- ``media_tools`` : helpers medias (extensions, chemins surs, FFmpeg).
- ``templating``  : rendu Jinja2 + compatibilite Flask (url_for, flash).
- ``routers``     : endpoints HTTP (auth, pages, media, kling).

Ce module assemble le tout : middleware (session, cache, gzip, limite d'upload),
fichiers statiques, gestionnaires d'exceptions et routeurs.
"""

import logging
import threading
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from . import api_client, config, kling
from .caching import CompressibleStaticFiles, SelectiveGZipMiddleware, StaticCacheMiddleware
from .deps import NotAuthenticated
from .kling import KlingError
from .routers import auth, emoji, llm, media, pages
from .routers import kling as kling_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("goldfx")


def _warm_database() -> None:
    """Initialise la base en arriere-plan (l'import SQLAlchemy est ainsi differe)."""
    from sqlalchemy.exc import SQLAlchemyError

    try:
        from . import db

        db.init_db()
    except (OSError, SQLAlchemyError):
        logger.exception("Initialisation de la base de donnees échouée")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Cycle de vie : prepare la base en arriere-plan et ferme les clients HTTP."""
    logger.info("GOLD FX demarre (API externe : %s)", config.API_BASE_URL)
    threading.Thread(target=_warm_database, name="db-warmup", daemon=True).start()
    yield
    await kling.aclose()
    await api_client.aclose()


def create_app() -> FastAPI:
    """Construit et configure l'application FastAPI (middleware, routeurs, erreurs)."""
    app = FastAPI(
        title="GOLD FX",
        version="4.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        SessionMiddleware,
        secret_key=config.SECRET_KEY,
        session_cookie=config.SESSION_COOKIE_NAME,
        max_age=config.SESSION_MAX_AGE,
        same_site="lax",
        https_only=config.SESSION_HTTPS_ONLY,
    )
    app.add_middleware(StaticCacheMiddleware, max_age=config.STATIC_CACHE_SECONDS)
    if config.ENABLE_GZIP:
        app.add_middleware(SelectiveGZipMiddleware, minimum_size=config.GZIP_MINIMUM_SIZE)

    @app.middleware("http")
    async def limit_upload_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if (
            content_length
            and content_length.isdigit()
            and int(content_length) > config.MAX_UPLOAD_BYTES
        ):
            return JSONResponse(
                {"error": f"Fichier trop volumineux (max {config.MAX_UPLOAD_MB} Mo)"},
                status_code=413,
            )
        return await call_next(request)

    app.mount(
        "/static",
        CompressibleStaticFiles(directory=str(config.STATIC_DIR)),
        name="static",
    )

    @app.exception_handler(NotAuthenticated)
    async def _not_authenticated(request: Request, _exc: NotAuthenticated):
        return RedirectResponse(f"/login?next={quote(str(request.url))}", status_code=303)

    @app.exception_handler(KlingError)
    async def _kling_error(_request: Request, exc: KlingError):
        logger.warning("Erreur API Kling (%s) : %s", exc.code, exc.message)
        return JSONResponse(
            {"error": exc.message, "message": exc.message, "code": exc.code},
            status_code=exc.http_status,
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, _exc: Exception):
        logger.exception("Erreur non gérée sur %s", request.url.path)
        return JSONResponse({"error": "Erreur interne du serveur"}, status_code=500)

    app.include_router(auth.router)
    app.include_router(pages.router)
    app.include_router(media.router)
    app.include_router(kling_router.router)
    app.include_router(llm.router)
    app.include_router(emoji.router)

    return app
