"""Proxy multi-fournisseurs de modeles (LLM / generation).

Objectif : pouvoir router une demande vers Kling AI, un modele Hugging Face
(MiniMax, Qwen...), ou un LLM local, **par configuration**, sans modifier le
code appelant.

- ``base`` : contrat ``Provider`` (+ ``GenerationRequest``/``GenerationResult``).
- ``router`` : selection (capacite, quota, priorite, coherence, repli).
- ``quota`` : garde-fou de quotas par fournisseur.
- ``kling_provider`` / ``openai_provider`` : implementations.
- ``registry`` : construit le routeur depuis la configuration.
"""

from .base import (
    Capability,
    GenerationRequest,
    GenerationResult,
    Provider,
    ProviderError,
)
from .quota import QuotaTracker
from .registry import build_router, get_router
from .router import Router

__all__ = [
    "Capability",
    "GenerationRequest",
    "GenerationResult",
    "Provider",
    "ProviderError",
    "QuotaTracker",
    "Router",
    "build_router",
    "get_router",
]
