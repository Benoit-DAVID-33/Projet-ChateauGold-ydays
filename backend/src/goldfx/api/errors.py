"""Traduction des erreurs métier en réponses HTTP homogènes.

Format : ``{"error": {"code": "...", "message": "..."}}`` — les messages sont
destinés à l'utilisateur (français) ; aucun détail interne n'est exposé.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from goldfx.domain import errors as e

logger = logging.getLogger(__name__)

_STATUS: dict[type[e.DomainError], int] = {
    e.NotFoundError: status.HTTP_404_NOT_FOUND,
    e.AuthenticationError: status.HTTP_401_UNAUTHORIZED,
    e.ConflictError: status.HTTP_409_CONFLICT,
    e.ValidationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    e.PayloadTooLargeError: status.HTTP_413_CONTENT_TOO_LARGE,
    e.UnsupportedMediaTypeError: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    e.RateLimitedError: status.HTTP_429_TOO_MANY_REQUESTS,
    e.ConfigurationError: status.HTTP_503_SERVICE_UNAVAILABLE,
    e.ExternalServiceError: status.HTTP_502_BAD_GATEWAY,
}


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def _status_for(exc: e.DomainError) -> int:
    for cls in type(exc).__mro__:
        if cls in _STATUS:
            return _STATUS[cls]
    return status.HTTP_400_BAD_REQUEST


async def _domain_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, e.DomainError):  # garde de typage
        raise exc
    code = _status_for(exc)
    if code >= 500:
        logger.warning("domain_error path=%s code=%s msg=%s", request.url.path, exc.code, exc)
    return JSONResponse(error_body(exc.code, exc.message), status_code=code)


async def _validation_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):  # garde de typage
        raise exc
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", ())[1:]) or "requête"
    message = f"Champ invalide : {field} ({first.get('msg', 'valeur incorrecte')})"
    return JSONResponse(
        error_body("validation_error", message),
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
    )


async def _http_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):  # garde de typage
        raise exc
    return JSONResponse(
        error_body("http_error", str(exc.detail)),
        status_code=exc.status_code,
        headers=getattr(exc, "headers", None),
    )


async def _unexpected_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_error path=%s", request.url.path)
    return JSONResponse(
        error_body("internal_error", "Erreur interne du serveur"),
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(e.DomainError, _domain_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_handler)
    app.add_exception_handler(Exception, _unexpected_handler)
