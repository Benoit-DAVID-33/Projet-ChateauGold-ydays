"""Routeur multi-fournisseurs : choisit le meilleur fournisseur pour une demande.

Politique de selection, dans l'ordre :

1. **capacite** — le fournisseur sait-il faire ce type de generation ?
2. **configuration** — on ecarte ceux sans cle / URL (aucun appel inutile) ;
3. **gratuite** — en mode ``free_only`` (``LLM_FREE_ONLY``, actif par defaut),
   seuls les fournisseurs declares gratuits sont utilises : aucun compte
   (Hugging Face, Kling, MiniMax...) ne peut etre debite par le proxy ;
4. **quota** — on ecarte ceux ayant atteint leur limite du jour ;
5. **priorite** — ordre de configuration (``LLM_PROVIDER_PRIORITY``) ;
6. **coherence** — une tache deja confiee reste chez son fournisseur (le suivi
   d'une tache ne doit pas changer de fournisseur en cours de route) ;
7. **repli** — en cas d'echec, on essaie le fournisseur suivant.

Exemple : passer de Kling AI a un modele Hugging Face (MiniMax...) ou a un LLM
local se fait par configuration, sans modifier le code appelant.
"""

import asyncio
import logging
import time

from server.proxy.contract import (
    Capability,
    GenerationRequest,
    GenerationResult,
    Provider,
    ProviderError,
)
from server.proxy.quotas import QuotaTracker

logger = logging.getLogger("goldfx")


class Router:
    """Selectionne un fournisseur et gere le repli et la coherence des taches."""

    def __init__(
        self,
        providers: list[Provider],
        quota: QuotaTracker | None = None,
        *,
        free_only: bool = False,
        health_ttl: float = 0.0,
    ) -> None:
        self._providers = list(providers)
        self._quota = quota or QuotaTracker()
        self._free_only = free_only
        self._task_owner: dict[str, Provider] = {}
        self._health_ttl = health_ttl
        self._health_cache: tuple[float, dict[str, bool]] | None = None

    @property
    def free_only(self) -> bool:
        """Indique si le routeur n'utilise que des fournisseurs gratuits."""
        return self._free_only

    def exclusion_reason(self, provider: Provider) -> str | None:
        """Raison pour laquelle un fournisseur est ecarte (None s'il est utilisable)."""
        if not provider.configured:
            return "non configuré"
        if self._free_only and not provider.free:
            return "écarté : payant (LLM_FREE_ONLY=true)"
        if not self._quota.available(provider.name):
            return "quota du jour atteint"
        return None

    @property
    def providers(self) -> list[Provider]:
        """Fournisseurs enregistres, dans l'ordre de priorite."""
        return list(self._providers)

    def candidates(self, capability: Capability) -> list[Provider]:
        """Fournisseurs eligibles pour une capacite, dans l'ordre de priorite."""
        return [
            provider
            for provider in self._providers
            if provider.supports(capability) and self.exclusion_reason(provider) is None
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

        if errors:
            detail = " | ".join(errors)
        elif self._free_only:
            detail = (
                f"aucun fournisseur gratuit configuré pour « {request.capability.value} » "
                "(LLM_FREE_ONLY=true)"
            )
        else:
            detail = "aucun fournisseur configuré ne supporte cette capacité"
        raise ProviderError("router", f"Aucun fournisseur disponible ({detail})")

    async def status(self, task_id: str) -> GenerationResult:
        """Retourne l'etat d'une tache, chez le fournisseur qui l'a creee."""
        provider = self._task_owner.get(task_id)
        if provider is None:
            raise ProviderError("router", f"Tâche inconnue du routeur : {task_id}")
        return await provider.status(task_id)

    async def health(self) -> dict[str, bool]:
        """Etat de joignabilite de chaque fournisseur (nom -> joignable).

        Les verifications partent **en parallele** et le resultat est garde
        ``health_ttl`` secondes : la console d'administration ne relance pas
        une salve de requetes reseau a chaque affichage.
        """
        now = time.monotonic()
        if self._health_cache is not None and now - self._health_cache[0] < self._health_ttl:
            return dict(self._health_cache[1])

        async def check(provider: Provider) -> bool:
            try:
                return await provider.health()
            except ProviderError:
                return False

        results = await asyncio.gather(*(check(provider) for provider in self._providers))
        report = {provider.name: ok for provider, ok in zip(self._providers, results, strict=True)}
        self._health_cache = (now, report)
        return dict(report)

    def quota_remaining(self) -> dict[str, int | None]:
        """Requetes restantes par fournisseur (None = illimite)."""
        return {provider.name: self._quota.remaining(provider.name) for provider in self._providers}

    async def describe(self) -> list[dict]:
        """Decrit les fournisseurs : capacites, joignabilite, quota, facturation, eligibilite."""
        health = await self.health()
        remaining = self.quota_remaining()
        described = []
        for provider in self._providers:
            reason = self.exclusion_reason(provider)
            described.append(
                {
                    "name": provider.name,
                    "capabilities": sorted(cap.value for cap in provider.capabilities),
                    "reachable": health.get(provider.name, False),
                    "quota_remaining": remaining.get(provider.name),
                    "configured": provider.configured,
                    "free": provider.free,
                    "billing": provider.billing_note,
                    "eligible": reason is None,
                    "reason": reason,
                }
            )
        return described
