"""Routes HTTP, un fichier par prefixe d'URL.

| Fichier | Prefixe | Role |
| --- | --- | --- |
| ``auth.py`` | ``/login``, ``/register``, ``/logout`` | comptes et session |
| ``pages.py`` | ``/``, ``/video``, ``/studio``, ``/offres``... | pages HTML |
| ``media.py`` | ``/upload``, ``/videos``, ``/images``... | fichiers medias |
| ``kling.py`` | ``/kling`` | acces direct a l'API Kling |
| ``video_edits.py`` | ``/api/video-edits`` | edition video IA (plan, travaux) |
| ``prompts.py`` | ``/api/prompt`` | tri, prompt engineering, chatbot |
| ``proxy.py`` | ``/api/llm`` | proxy multi-fournisseurs LLM |
| ``plans.py`` | ``/api/plans`` | offres et demande Studio |
| ``emoji.py`` | ``/api/emoji`` | studio emoji |
| ``admin.py`` | ``/admin``, ``/api/admin`` | console d'administration |
| ``schemas.py`` | | corps de requete valides (Pydantic) |
"""

from fastapi import APIRouter


def all_routers() -> list[APIRouter]:
    """Routeurs de l'application, dans l'ordre d'enregistrement."""
    from server.api import (
        admin,
        auth,
        emoji,
        kling,
        media,
        pages,
        plans,
        prompts,
        proxy,
        video_edits,
    )

    modules = (auth, pages, media, kling, proxy, emoji, prompts, video_edits, plans, admin)
    return [module.router for module in modules]
