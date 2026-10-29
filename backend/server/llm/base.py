"""Contrat commun a tous les fournisseurs de modeles (proxy multi-LLM).

Ce module ne doit importer **aucune** dependance lourde : il est charge au
demarrage et definit l'interface que respectent tous les fournisseurs
(Kling AI, Hugging Face, LLM local...). Le reste de l'application ne connait
que ``Provider``, jamais une implementation concrete.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import StrEnum


class Capability(StrEnum):
    """Type de generation supporte par un fournisseur."""

    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"


@dataclass(frozen=True)
class GenerationRequest:
    """Demande de generation, independante du fournisseur."""

    capability: Capability
    prompt: str
    options: dict = field(default_factory=dict)


@dataclass(frozen=True)
class GenerationResult:
    """Resultat normalise renvoye par un fournisseur."""

    provider: str
    task_id: str
    status: str
    payload: dict


class ProviderError(Exception):
    """Erreur normalisee d'un fournisseur (message clair + caractere reessayable)."""

    def __init__(self, provider: str, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.provider = provider
        self.message = message
        self.retryable = retryable


class Provider(ABC):
    """Interface commune a tous les fournisseurs de modeles."""

    name: str = "base"
    capabilities: frozenset[Capability] = frozenset()

    @abstractmethod
    async def submit(self, request: GenerationRequest) -> GenerationResult:
        """Soumet une demande et retourne un resultat (eventuellement en cours)."""

    @abstractmethod
    async def status(self, task_id: str) -> GenerationResult:
        """Retourne l'etat d'une tache confiee a ce fournisseur."""

    @abstractmethod
    async def health(self) -> bool:
        """Indique si le fournisseur est configure et joignable."""

    def supports(self, capability: Capability) -> bool:
        """Indique si le fournisseur sait traiter cette capacite."""
        return capability in self.capabilities
