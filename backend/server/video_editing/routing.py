"""Choix du modele le plus coherent pour UNE modification.

Le choix est **explicable** : chaque decision liste pourquoi le modele retenu
gagne et pourquoi les autres sont ecartes (cle absente, ratio non supporte,
qualite indisponible...). Aucune qualite n'est inventee : si le niveau demande
n'existe pas chez un modele, on retombe sur le niveau inferieur reel et on le
dit, jamais sur un niveau superieur (plus cher) sans demande.

Barème (additif) :

- +3 si l'intention fait partie des points forts du modele ;
- -1 par morceau supplementaire si la fenetre depasse la duree maximale
  (risque de discontinuite), -0,5 si elle doit etre elargie au minimum ;
- la qualite demandee est prioritaire : un modele qui ne la fournit pas n'est
  retenu que si aucun autre ne la fournit (-2, et c'est signale) ;
- -2 x cout estime (USD) : a qualite egale, le moins cher gagne ; un prix non
  publie est estime au plus cher connu (l'opacite n'est jamais avantagee).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field

from server import config
from server.video_editing.catalog import (
    MODELS,
    QUALITY_LABELS,
    QUALITY_ORDER,
    QualityTier,
    VideoModel,
)


def _space_status(model: VideoModel) -> str | None:
    """Demonstration gratuite : activee et quota anonyme du jour suffisant ?"""
    from server.video_editing.providers.hf_space import estimate_gpu_seconds, get_budget

    if not config.HF_SPACE_ENABLED:
        return "démonstration gratuite désactivée (HF_SPACE_ENABLED)"
    if get_budget().remaining() < estimate_gpu_seconds(model.min_seconds):
        return "quota gratuit du jour épuisé"
    return None


def provider_status(model: VideoModel) -> str | None:
    """Raison pour laquelle le modele est inutilisable ici, ou None s'il est pret."""
    if not model.integrated:
        return "non intégré dans ce backend"
    if config.VIDEO_EDITING_SIMULATE:
        return None
    if model.provider == "hf_space":
        return _space_status(model)
    missing = {
        "kling": not (config.KLING_ACCESS_KEY and config.KLING_SECRET_KEY),
        "fal": not config.FAL_API_KEY,
        "decart": not config.DECART_API_KEY,
        "luma": not config.LUMA_API_KEY,
    }
    if missing.get(model.provider, True):
        return f"clé API {model.provider} absente"
    if model.provider == "kling" and not config.PUBLIC_BASE_URL:
        return "PUBLIC_BASE_URL manquante (Kling télécharge la vidéo par URL)"
    return None


@dataclass(frozen=True)
class RouteRequest:
    """Ce qu'il faut savoir d'une modification pour choisir le modele."""

    intent: str
    window_seconds: float
    video_seconds: float
    quality: str = "standard"
    aspect_ratio: str = "16:9"
    preferred_model: str = "auto"


@dataclass(frozen=True)
class RouteDecision:
    """Modele retenu, niveau de qualite reel et justification."""

    model: VideoModel
    tier: QualityTier
    score: float
    reasons: list[str]
    alternatives: list[dict] = field(default_factory=list)
    rejected: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict:
        """Representation JSON (pour le plan de montage)."""
        return {
            "model": self.model.key,
            "label": self.model.label,
            "quality": self.tier.key,
            "quality_label": self.tier.label,
            "resolution": self.tier.resolution,
            "price_usd_per_second": self.tier.price_usd_per_second,
            "price_evidence": self.tier.price_evidence,
            "score": round(self.score, 2),
            "reasons": self.reasons,
            "alternatives": self.alternatives,
            "rejected": self.rejected,
        }


class NoModelAvailable(Exception):
    """Aucun modele ne peut traiter la modification (detail des refus inclus)."""

    def __init__(self, message: str, rejected: dict[str, str]) -> None:
        super().__init__(message)
        self.message = message
        self.rejected = rejected


def _best_tier(model: VideoModel, quality: str) -> tuple[QualityTier | None, bool]:
    """Niveau demande s'il existe, sinon le meilleur niveau inferieur (et un drapeau)."""
    exact = model.tier(quality)
    if exact is not None:
        return exact, False
    wanted = QUALITY_ORDER.index(quality)
    lower = [model.tier(key) for key in QUALITY_ORDER[:wanted] if model.tier(key)]
    return (lower[-1], True) if lower else (None, False)


def pessimistic_price(quality: str) -> float:
    """Prix par seconde le plus eleve publie pour ce niveau (ou tous niveaux confondus)."""
    known = [
        tier.price_usd_per_second
        for model in MODELS.values()
        for tier in model.tiers
        if tier.price_usd_per_second is not None
    ]
    same_tier = [
        tier.price_usd_per_second
        for model in MODELS.values()
        if (tier := model.tier(quality)) is not None and tier.price_usd_per_second is not None
    ]
    return max(same_tier or known or [0.0])


def _score(model: VideoModel, request: RouteRequest) -> tuple[float, list[str], str | None]:
    """Score d'un modele pour la demande, avec les raisons, ou un motif de refus."""
    if model.aspect_ratios and request.aspect_ratio not in model.aspect_ratios:
        allowed = " ou ".join(model.aspect_ratios)
        return 0, [], f"ratio {request.aspect_ratio} non supporté ({allowed} uniquement)"
    tier, downgraded = _best_tier(model, request.quality)
    if tier is None:
        return 0, [], f"aucun niveau ≤ {QUALITY_LABELS[request.quality]} disponible"

    score, reasons = 0.0, []
    if request.intent in model.strengths:
        score += 3
        reasons.append(f"point fort du modèle pour « {request.intent} »")
    elif request.intent != "generic":
        score -= 2
        reasons.append(f"« {request.intent} » n'est pas un point fort du modèle")
    if model.max_seconds is not None and request.window_seconds > model.max_seconds:
        chunks = math.ceil(request.window_seconds / model.max_seconds)
        score -= chunks - 1
        reasons.append(f"fenêtre découpée en {chunks} morceaux (max {model.max_seconds:g} s)")
    elif request.window_seconds < model.min_seconds:
        score -= 0.5
        reasons.append(f"fenêtre élargie au minimum de {model.min_seconds:g} s du modèle")
    if downgraded:
        score -= 2
        reasons.append(
            f"qualité {QUALITY_LABELS[request.quality]} indisponible : {tier.label} à la place"
        )
    seconds = max(request.window_seconds, model.min_seconds)
    if tier.price_usd_per_second is None:
        # Prix inconnu : on suppose le plus cher connu, pour ne jamais favoriser l'opacite.
        cost = pessimistic_price(tier.key) * seconds
        score -= 2 * cost
        reasons.append(f"prix non publié : estimé au plus cher connu ({cost:.2f} $)")
    else:
        cost = tier.price_usd_per_second * seconds
        score -= 2 * cost
        reasons.append(f"coût estimé {cost:.2f} $ ({tier.price_evidence})")
    return score, reasons, None


def plan_status(free_only: bool) -> Callable[[VideoModel], str | None]:
    """Disponibilite pour une offre : l'offre gratuite peut etre limitee aux modeles gratuits."""

    def status(model: VideoModel) -> str | None:
        if free_only and not model.free:
            return "réservé à l'offre Studio"
        return provider_status(model)

    return status


def choose_model(
    request: RouteRequest,
    status: Callable[[VideoModel], str | None] = provider_status,
) -> RouteDecision:
    """Retourne le meilleur modele disponible, ou leve ``NoModelAvailable``."""
    candidates: list[VideoModel] = list(MODELS.values())
    if request.preferred_model not in ("", "auto"):
        chosen = MODELS.get(request.preferred_model)
        if chosen is None:
            raise NoModelAvailable(f"Modèle inconnu : {request.preferred_model}", {})
        candidates = [chosen]

    rejected: dict[str, str] = {}
    scored: list[tuple[float, VideoModel, list[str]]] = []
    for model in candidates:
        reason = status(model)
        if reason is None:
            score, reasons, refusal = _score(model, request)
            if refusal is None:
                scored.append((score, model, reasons))
                continue
            reason = refusal
        rejected[model.key] = reason

    # La qualite demandee prime : on ne retombe sur un niveau inferieur que si
    # AUCUN modele disponible ne fournit le niveau demande.
    exact = [item for item in scored if item[1].tier(request.quality) is not None]
    if exact and len(exact) < len(scored):
        for _, model, _ in scored:
            if model.tier(request.quality) is None:
                rejected[model.key] = f"qualité {QUALITY_LABELS[request.quality]} non proposée"
        scored = exact

    if not scored:
        raise NoModelAvailable("Aucun modèle disponible pour cette modification", rejected=rejected)
    scored.sort(key=lambda item: item[0], reverse=True)
    score, model, reasons = scored[0]
    tier, _ = _best_tier(model, request.quality)
    if tier is None:  # impossible : _score a deja refuse les modeles sans niveau
        raise NoModelAvailable("Aucun niveau de qualité disponible", rejected)
    alternatives = [
        {"model": other.key, "score": round(other_score, 2)} for other_score, other, _ in scored[1:]
    ]
    return RouteDecision(model, tier, score, reasons, alternatives, rejected)
