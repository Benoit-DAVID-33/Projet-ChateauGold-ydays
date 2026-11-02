"""Adaptateurs d'API d'edition video, un fichier par fournisseur.

``get_provider(nom)`` retourne l'adaptateur partage correspondant a
``VideoModel.provider`` dans le catalogue.
"""

from server.video_editing.providers.base import (
    EditJobInput,
    EditProvider,
    EditProviderError,
    PollResult,
)
from server.video_editing.providers.decart import DecartEditProvider
from server.video_editing.providers.fal import FalEditProvider
from server.video_editing.providers.kling import KlingEditProvider
from server.video_editing.providers.luma import LumaEditProvider

_PROVIDERS: dict[str, EditProvider] = {
    "kling": KlingEditProvider(),
    "fal": FalEditProvider(),
    "decart": DecartEditProvider(),
    "luma": LumaEditProvider(),
}


def get_provider(name: str) -> EditProvider:
    """Adaptateur d'un fournisseur (``EditProviderError`` s'il n'existe pas)."""
    provider = _PROVIDERS.get(name)
    if provider is None:
        raise EditProviderError(f"Aucun adaptateur pour le fournisseur « {name} »")
    return provider


__all__ = [
    "EditJobInput",
    "EditProvider",
    "EditProviderError",
    "PollResult",
    "get_provider",
]
