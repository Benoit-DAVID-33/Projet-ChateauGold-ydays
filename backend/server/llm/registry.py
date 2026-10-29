"""Construction du routeur multi-fournisseurs a partir de la configuration.

Les fournisseurs disponibles sont declares dans ``_BUILDERS``. En ajouter un
nouveau revient a ecrire une classe ``Provider`` puis a l'enregistrer ici, et a
l'activer via ``LLM_PROVIDER_PRIORITY`` dans le ``.env``.
"""

import logging
from functools import lru_cache

from .. import config
from .base import Provider
from .kling_provider import KlingProvider
from .openai_provider import OpenAICompatibleProvider
from .quota import QuotaTracker
from .router import Router

logger = logging.getLogger("goldfx")

_BUILDERS = {
    "kling": KlingProvider,
    "huggingface": lambda: OpenAICompatibleProvider(
        name="huggingface",
        base_url=config.HF_API_BASE_URL,
        model=config.HF_MODEL,
        api_key=config.HF_API_TOKEN,
        timeout=config.LLM_TIMEOUT_SECONDS,
    ),
    "local": lambda: OpenAICompatibleProvider(
        name="local",
        base_url=config.LOCAL_LLM_BASE_URL,
        model=config.LOCAL_LLM_MODEL,
        api_key=config.LOCAL_LLM_API_KEY,
        timeout=config.LLM_TIMEOUT_SECONDS,
    ),
}


def build_router() -> Router:
    """Construit un routeur selon ``LLM_PROVIDER_PRIORITY``."""
    providers: list[Provider] = []
    for name in config.LLM_PROVIDER_PRIORITY:
        builder = _BUILDERS.get(name)
        if builder is None:
            logger.warning("Fournisseur LLM inconnu ignoré : %s", name)
            continue
        providers.append(builder())
    return Router(providers, QuotaTracker(config.LLM_QUOTAS))


@lru_cache(maxsize=1)
def get_router() -> Router:
    """Retourne le routeur partage, cree a la premiere utilisation."""
    return build_router()
