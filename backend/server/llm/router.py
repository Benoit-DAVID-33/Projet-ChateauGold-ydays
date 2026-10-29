"""Routeur multi-fournisseurs : choisit le meilleur fournisseur pour une demande.

Politique de selection, dans l'ordre :

1. **capacite** — le fournisseur sait-il faire ce type de generation ?
2. **quota** — on ecarte ceux ayant atteint leur limite ;
3. **priorite** — ordre de configuration (``LLM_PROVIDER_PRIORITY``) ;
4. **coherence** — une tache deja confiee reste chez son fournisseur (le suivi
   d'une tache ne doit pas changer de fournisseur en cours de route) ;
5. **repli** — en cas d'echec, on essaie le fournisseur suivant.

Exemple : passer de Kling AI a un modele Hugging Face (MiniMax...) ou a un LLM
local se fait par configuration, sans modifier le code appelant.
"""

import logging

from .base import Capability, GenerationRequest, GenerationResult, Provider, ProviderError
from .quota import QuotaTracker

logger = logging.getLogger("goldfx")


class Router:
    """Selectionne un fournisseur et gere le repli et la coherence des taches."""

    def __init__(self, providers: list[Provider], quota: QuotaTracker | None = None) -> None:
        self._providers = list(providers)
        self._quota = quota or QuotaTracker()
        self._task_owner: dict[str, Provider] = {}

    @property
    def providers(self) -> list[Provider]:
        """Fournisseurs enregistres, dans l'ordre de priorite."""
        return list(self._providers)

    def candidates(self, capability: Capability) -> list[Provider]:
        """Fournisseurs eligibles pour une capacite, dans l'ordre de priorite."""
        return [
            provider
            for provider in self._providers
            if provider.supports(capability) and self._quota.available(provider.name)
        ]

    async def submit(self, request: GenerationRequest) -> GenerationResult:
        """Soumet la demande au premier fournisseur eligible, avec repli."""
        errors: list[str] = []
        for provider in self.candidates(request.capability):
            try:
                result = await provider.submit(request)
            except ProviderError as exc:
                errors.append(f"{provider.name}: {exc.message}")
                logger.warning("Fournisseur %s en échec : %s", provider.name, exc.message)
                continue
            self._quota.consume(provider.name)
            if result.task_id:
                self._task_owner[result.task_id] = provider
            return result

        detail = " | ".join(errors) if errors else "aucun fournisseur ne supporte cette capacité"
        raise ProviderError("router", f"Aucun fournisseur disponible ({detail})")

    async def status(self, task_id: str) -> GenerationResult:
        """Retourne l'etat d'une tache, chez le fournisseur qui l'a creee."""
        provider = self._task_owner.get(task_id)
        if provider is None:
            raise ProviderError("router", f"Tâche inconnue du routeur : {task_id}")
        return await provider.status(task_id)

    async def health(self) -> dict[str, bool]:
        """Etat de joignabilite de chaque fournisseur (nom -> joignable)."""
        report: dict[str, bool] = {}
        for provider in self._providers:
            try:
                report[provider.name] = await provider.health()
            except ProviderError:
                report[provider.name] = False
        return report

    def quota_remaining(self) -> dict[str, int | None]:
        """Requetes restantes par fournisseur (None = illimite)."""
        return {provider.name: self._quota.remaining(provider.name) for provider in self._providers}
