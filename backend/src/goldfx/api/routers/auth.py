from __future__ import annotations

import secrets

from fastapi import APIRouter, Request, Response, status

from goldfx.api.deps import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    AuthServiceDep,
    ContainerDep,
    CurrentUser,
    client_key,
)
from goldfx.api.schemas import CsrfOut, LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_csrf_cookie(response: Response, secure: bool) -> str:
    token = secrets.token_urlsafe(32)
    # Lisible par le JS (double-submit) ; SameSite=Strict.
    response.set_cookie(
        CSRF_COOKIE, token, httponly=False, secure=secure, samesite="strict", path="/"
    )
    return token


@router.get("/csrf", response_model=CsrfOut)
def csrf(request: Request, response: Response, container: ContainerDep) -> CsrfOut:
    """Fournit (ou renouvelle) le jeton CSRF ; à appeler au chargement de l'app."""
    existing = request.cookies.get(CSRF_COOKIE)
    if existing:
        return CsrfOut(csrf_token=existing)
    return CsrfOut(csrf_token=_set_csrf_cookie(response, container.settings.cookie_secure))


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, auth: AuthServiceDep) -> UserOut:
    user = auth.register(payload.username, str(payload.email), payload.password)
    return UserOut.of(user)


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    auth: AuthServiceDep,
    container: ContainerDep,
) -> UserOut:
    result = auth.login(payload.identifier, payload.password, client_key(request))
    settings = container.settings
    response.set_cookie(
        SESSION_COOKIE,
        result.token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    # Nouveau jeton CSRF à chaque connexion (évite la fixation de jeton).
    _set_csrf_cookie(response, settings.cookie_secure)
    return UserOut.of(result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, auth: AuthServiceDep) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        auth.logout(token)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.of(user)
