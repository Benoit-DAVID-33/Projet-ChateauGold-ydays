"""Point d'entrée ASGI : ``uvicorn --factory goldfx.main:create_app``."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from goldfx import __version__
from goldfx.api.errors import register_error_handlers
from goldfx.api.middleware import AccessLogMiddleware, CsrfMiddleware, SecurityHeadersMiddleware
from goldfx.api.routers import auth, features, health, media, workflows
from goldfx.background import GenerationSweeper
from goldfx.config import Settings, get_settings
from goldfx.container import Container, build_container
from goldfx.logging_setup import configure_logging

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_json)
    container = container or build_container(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info("goldfx.start version=%s env=%s", __version__, settings.environment)
        sweeper: GenerationSweeper | None = None
        if settings.generation_sweep_seconds > 0 and settings.kling_configured:
            sweeper = GenerationSweeper(container, settings.generation_sweep_seconds)
            sweeper.start()
        yield
        if sweeper is not None:
            sweeper.stop()
        container.engine.dispose()

    docs = not settings.is_production
    app = FastAPI(
        title="GOLD FX API",
        version=__version__,
        description="API d'édition et de génération de médias assistée par IA.",
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
        lifespan=lifespan,
    )
    app.state.container = container

    # Ordre d'exécution : le dernier ajouté est le premier exécuté.
    app.add_middleware(CsrfMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=["Content-Type", "X-CSRF-Token"],
        )
    app.add_middleware(AccessLogMiddleware)

    register_error_handlers(app)
    for module in (health, auth, media, features, workflows):
        app.include_router(module.router)
    return app
