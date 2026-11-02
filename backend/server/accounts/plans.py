"""Offres du site : « Découverte » (gratuite, limitee) et « Studio » (payante).

Regle d'honnetete : chaque avantage liste dans ``features`` correspond a une
limite **appliquee par le code** (voir ``server.video_editing.service``) ; on
n'affiche aucun avantage qui ne serait pas reellement implemente.

Le paiement en ligne n'est pas integre : l'offre Studio est activee par un
administrateur apres une demande (``POST /api/plans/upgrade-request``).
"""

from __future__ import annotations

from dataclasses import dataclass

from server import config
from server.video_editing.catalog import QUALITY_ORDER


@dataclass(frozen=True)
class Plan:
    """Limites et avantages d'une offre."""

    key: str
    label: str
    tagline: str
    price_label: str
    daily_generations: int
    max_quality: str
    max_edits_per_job: int
    max_video_seconds: int
    max_job_cost_usd: float
    queue_priority: int
    features: tuple[str, ...]

    def allows_quality(self, quality: str) -> bool:
        """Indique si le niveau de qualite est inclus dans l'offre."""
        return QUALITY_ORDER.index(quality) <= QUALITY_ORDER.index(self.max_quality)

    @property
    def qualities(self) -> tuple[str, ...]:
        """Niveaux de qualite inclus, du plus bas au plus haut."""
        return tuple(key for key in QUALITY_ORDER if self.allows_quality(key))


def _free() -> Plan:
    daily = config.PLAN_FREE_DAILY_GENERATIONS
    return Plan(
        key="free",
        label="Découverte",
        tagline="Pour tester l'édition vidéo par IA",
        price_label="Gratuit",
        daily_generations=daily,
        max_quality="standard",
        max_edits_per_job=2,
        max_video_seconds=30,
        max_job_cost_usd=config.PLAN_FREE_MAX_JOB_COST_USD,
        queue_priority=10,
        features=(
            "Assistant de montage illimité (vocabulaire de tournage)",
            "Récapitulatif avant lancement, sans limite",
            f"{daily} génération(s) vidéo par jour",
            (
                "Qualité HD (720p)"
                if config.PLAN_FREE_ONLY_FREE_MODELS
                else "Qualité Rapide et HD (jusqu'à 720p)"
            ),
            "2 modifications par vidéo, vidéo de 30 s max",
            *(
                ("Rendu par un modèle open source gratuit, par passages de 4 s",)
                if config.PLAN_FREE_ONLY_FREE_MODELS
                else ()
            ),
        ),
    )


def _studio() -> Plan:
    daily = config.PLAN_STUDIO_DAILY_GENERATIONS
    return Plan(
        key="studio",
        label="Studio",
        tagline="Pour les productions et les monteurs",
        price_label=config.PLAN_STUDIO_PRICE_LABEL,
        daily_generations=daily,
        max_quality="4k",
        max_edits_per_job=8,
        max_video_seconds=180,
        max_job_cost_usd=config.PLAN_STUDIO_MAX_JOB_COST_USD,
        queue_priority=0,
        features=(
            "Tout Découverte, plus :",
            f"{daily} générations vidéo par jour",
            "Qualité Full HD (1080p) et 4K",
            "8 modifications par vidéo, vidéo de 3 min max",
            "File de traitement prioritaire",
        ),
    )


def all_plans() -> dict[str, Plan]:
    """Offres disponibles (construites a la demande : la config peut varier en test)."""
    return {"free": _free(), "studio": _studio()}


def get_plan(key: str) -> Plan:
    """Retourne une offre ; une cle inconnue retombe sur l'offre gratuite."""
    plans = all_plans()
    return plans.get(key, plans["free"])
