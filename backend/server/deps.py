"""Dependances d'authentification partagees par les routeurs."""

from fastapi import HTTPException, Request, status


class NotAuthenticated(Exception):
    """Levee sur les routes de page : declenche une redirection vers /login."""


def current_username(request: Request) -> str | None:
    """Retourne le nom d'utilisateur de la session, ou None."""
    return request.session.get("username")


def require_user(request: Request) -> str:
    """Dependance des routes API : 401 si non authentifie."""
    username = current_username(request)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise"
        )
    return username


def require_user_page(request: Request) -> str:
    """Dependance des routes de page : redirige vers /login si non authentifie."""
    username = current_username(request)
    if not username:
        raise NotAuthenticated()
    return username
