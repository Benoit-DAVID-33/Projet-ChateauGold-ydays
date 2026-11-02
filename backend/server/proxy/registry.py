"""Construction du routeur multi-fournisseurs a partir de la configuration.

Les fournisseurs disponibles sont declares dans ``_BUILDERS``. En ajouter un
nouveau revient a ecrire une classe ``Provider`` puis a l'enregistrer ici, et a
l'activer via ``LLM_PROVIDER_PRIORITY`` dans le ``.env``.

Fournisseurs fournis et facturation :

=============== ========= ===================================================
Nom             Capacite  Facturation
=============== ========= ===================================================
``local``       texte     gratuit (Ollama, vLLM, llama.cpp sur la machine)
``openrouter``  texte     gratuit **uniquement** avec un modele ``:free``
``groq``        texte     gratuit sur le palier gratuit (``GROQ_FREE_TIER``)
``gemini``      texte     gratuit sur le palier gratuit (``GEMINI_FREE_TIER``)
``huggingface`` texte     payant : facture au proprietaire du jeton HF
``kling``       image/vid payant : credits du compte Kling
``minimax``     texte     payant
=============== ========= ===================================================

Avec ``LLM_FREE_ONLY=true`` (defaut), seuls les fournisseurs gratuits sont
utilises par le proxy. Les routes explicites ``/kling/*`` ne passent pas par
ce routeur.
"""

import logging
from collections.abc import Callable
from functools import lru_cache

from server import config
from server.proxy.contract import Provider
from server.proxy.kling_generation import KlingProvider
from server.proxy.openai_compatible import HuggingFaceProvider, OpenAICompatibleProvider
from server.proxy.quotas import QuotaTracker
from server.proxy.router import Router

logger = logging.getLogger("goldfx")

_FREE_TIER_NOTE = "gratuit (palier gratuit, tant que la facturation n'est pas activée)"


def _local() -> Provider:
    return OpenAICompatibleProvider(
        "local",
        config.LOCAL_LLM_BASE_URL,
        config.LOCAL_LLM_MODEL,
        config.LOCAL_LLM_API_KEY,
        config.LLM_TIMEOUT_SECONDS,
        free=True,
        billing_note="gratuit (modèle exécuté localement)",
    )


def _openrouter() -> Provider:
    # Le suffixe ":free" garantit un cout nul chez OpenRouter, meme avec des
    # credits sur le compte ; sans lui, le fournisseur est considere payant.
    is_free_model = config.OPENROUTER_MODEL.endswith(":free")
    return OpenAICompatibleProvider(
        "openrouter",
        config.OPENROUTER_API_BASE_URL,
        config.OPENROUTER_MODEL,
        config.OPENROUTER_API_KEY,
        config.LLM_TIMEOUT_SECONDS,
        free=is_free_model,
        requires_key=True,
        billing_note=(
            "gratuit (modèle « :free », coût nul)"
            if is_free_model
            else "payant : le modèle OpenRouter n'est pas suffixé « :free »"
        ),
    )


def _groq() -> Provider:
    return OpenAICompatibleProvider(
        "groq",
        config.GROQ_API_BASE_URL,
        config.GROQ_MODEL,
        config.GROQ_API_KEY,
        config.LLM_TIMEOUT_SECONDS,
        free=config.GROQ_FREE_TIER,
        requires_key=True,
        billing_note=_FREE_TIER_NOTE if config.GROQ_FREE_TIER else "",
    )


def _gemini() -> Provider:
    return OpenAICompatibleProvider(
        "gemini",
        config.GEMINI_API_BASE_URL,
        config.GEMINI_MODEL,
        config.GEMINI_API_KEY,
        config.LLM_TIMEOUT_SECONDS,
        free=config.GEMINI_FREE_TIER,
        requires_key=True,
        billing_note=_FREE_TIER_NOTE if config.GEMINI_FREE_TIER else "",
    )


def _huggingface() -> Provider:
    return HuggingFaceProvider(
        base_url=config.HF_API_BASE_URL,
        model=config.HF_MODEL,
        api_key=config.HF_API_TOKEN,
        timeout=config.LLM_TIMEOUT_SECONDS,
        forbidden_accounts=config.HF_FORBIDDEN_ACCOUNTS,
        expected_account=config.HF_EXPECTED_ACCOUNT,
        bill_to=config.HF_BILL_TO,
    )


def _minimax() -> Provider:
    return OpenAICompatibleProvider(
        "minimax",
        config.MINIMAX_API_BASE_URL,
        config.MINIMAX_MODEL,
        config.MINIMAX_API_KEY,
        config.LLM_TIMEOUT_SECONDS,
        requires_key=True,
        billing_note="payant : crédits du compte MiniMax",
    )


_BUILDERS: dict[str, Callable[[], Provider]] = {
    "local": _local,
    "openrouter": _openrouter,
    "groq": _groq,
    "gemini": _gemini,
    "huggingface": _huggingface,
    "kling": KlingProvider,
    "minimax": _minimax,
}


def build_router() -> Router:
    """Construit un routeur selon ``LLM_PROVIDER_PRIORITY`` et ``LLM_FREE_ONLY``."""
    providers: list[Provider] = []
    for name in config.LLM_PROVIDER_PRIORITY:
        builder = _BUILDERS.get(name)
        if builder is None:
            logger.warning("Fournisseur LLM inconnu ignoré : %s", name)
            continue
        providers.append(builder())
    quota = QuotaTracker(config.LLM_QUOTAS, path=config.LLM_QUOTA_FILE)
    return Router(
        providers, quota, free_only=config.LLM_FREE_ONLY, health_ttl=config.LLM_HEALTH_CACHE_SECONDS
    )


@lru_cache(maxsize=1)
def get_router() -> Router:
    """Retourne le routeur partage, cree a la premiere utilisation."""
    return build_router()
