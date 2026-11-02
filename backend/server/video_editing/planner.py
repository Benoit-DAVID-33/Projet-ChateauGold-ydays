"""Plan de montage : decoupage de la video en segments et generations a lancer.

Exemple : video de 20 s, « a 2 s integre un chevalier puis a 15 s ajoute un
dragon » (sans fin precisee : jusqu'a la fin de la video) donne :

    [0 - 2 s]   conserve tel quel
    [2 - 15 s]  chevalier
    [15 - 20 s] chevalier, puis dragon (une generation par modification)

Regles :

- les bornes de toutes les fenetres decoupent la video en segments ; un
  segment sans modification est copie tel quel ;
- un segment trop court pour le modele est **rendu avec du contexte** (fenetre
  elargie) puis recoupe a sa duree exacte : rien ne deborde hors de la fenetre ;
- un segment trop long est decoupe en morceaux egaux ; l'image de fin du
  morceau precedent sert de reference de continuite quand le modele l'accepte ;
- plusieurs modifications sur un meme segment sont enchainees (la sortie de
  l'une est la source de la suivante).

Ce module est **pur** (aucun appel reseau ni FFmpeg) : il est entierement teste.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import pairwise

from server.prompts import timecodes
from server.video_editing.routing import RouteDecision, RouteRequest, choose_model

_EPSILON = 0.05


@dataclass(frozen=True)
class EditRequest:
    """Une modification demandee (deja triee)."""

    prompt_source: str
    intent: str
    window: timecodes.TimeWindow


@dataclass
class EditCall:
    """Une generation : une modification appliquee a un morceau."""

    edit_index: int
    model: str
    quality: str
    prompt: str = ""
    negative_prompt: str = ""
    params: dict = field(default_factory=dict)


@dataclass
class Piece:
    """Morceau envoye au modele : rendu sur [render_start, render_end], garde [start, end]."""

    start: float
    end: float
    render_start: float
    render_end: float
    calls: list[EditCall] = field(default_factory=list)
    continuity_from_previous: bool = False


@dataclass
class Segment:
    """Portion de la video entre deux bornes, conservee ou modifiee."""

    start: float
    end: float
    edit_indexes: list[int]
    pieces: list[Piece] = field(default_factory=list)

    @property
    def action(self) -> str:
        """``keep`` (copie) ou ``edit`` (generations IA)."""
        return "edit" if self.edit_indexes else "keep"


@dataclass
class JobPlan:
    """Plan complet : segments, generations, cout estime et hypotheses."""

    video_seconds: float
    edits: list[dict]
    segments: list[Segment]
    warnings: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)

    @property
    def generations(self) -> int:
        """Nombre total d'appels aux modeles (= consommation du quota)."""
        return sum(len(piece.calls) for seg in self.segments for piece in seg.pieces)

    def estimated_cost(self, prices: dict[tuple[str, str], float | None]) -> float | None:
        """Cout total estime en USD (None si un prix est inconnu)."""
        total = 0.0
        for segment in self.segments:
            for piece in segment.pieces:
                for call in piece.calls:
                    price = prices.get((call.model, call.quality))
                    if price is None:
                        return None
                    total += price * (piece.render_end - piece.render_start)
        return round(total, 3)


def _windows(
    edits: list[EditRequest], duration: float
) -> tuple[list[tuple[float, float]], list[str]]:
    windows, notes = [], []
    for edit in edits:
        start, end, extra = edit.window.resolve(duration)
        notes.extend(extra)
        if not edit.window.is_set:
            notes.append(f"Aucun moment précisé pour « {edit.prompt_source} » : toute la vidéo.")
        windows.append((start, end))
    return windows, notes


def _split_points(windows: list[tuple[float, float]], duration: float) -> list[float]:
    points = {0.0, round(duration, 3)}
    for start, end in windows:
        points.update({round(start, 3), round(end, 3)})
    ordered = sorted(points)
    # fusionne les bornes trop proches (evite des segments de quelques images)
    merged = [ordered[0]]
    for point in ordered[1:]:
        if point - merged[-1] > _EPSILON:
            merged.append(point)
    merged[-1] = round(duration, 3)
    return merged


def _pieces_for(segment: Segment, decision: RouteDecision, duration: float) -> list[Piece]:
    """Decoupe un segment selon les bornes du modele (contexte ou morceaux)."""
    model = decision.model
    length = segment.end - segment.start
    if model.max_seconds is not None and length > model.max_seconds:
        count = math.ceil(length / model.max_seconds)
        size = length / count
        pieces = []
        for index in range(count):
            start = segment.start + index * size
            pieces.append(
                Piece(
                    start=start,
                    end=start + size,
                    render_start=start,
                    render_end=start + size,
                    continuity_from_previous=index > 0 and model.image_references > 0,
                )
            )
        return pieces
    render_start, render_end = segment.start, segment.end
    if length < model.min_seconds:
        render_end = min(duration, segment.start + model.min_seconds)
        render_start = max(0.0, render_end - model.min_seconds)
    return [Piece(segment.start, segment.end, render_start, render_end)]


def _segment(
    start: float,
    end: float,
    windows: list[tuple[float, float]],
    decisions: list[RouteDecision],
    video_seconds: float,
) -> tuple[Segment, list[str]]:
    """Construit un segment (modifications actives, morceaux, generations) + avertissements."""
    active = [
        index
        for index, (w_start, w_end) in enumerate(windows)
        if w_start <= start + _EPSILON and w_end >= end - _EPSILON and w_end - w_start > 0
    ]
    segment = Segment(start=start, end=end, edit_indexes=active)
    if not active:
        return segment, []
    # le modele le plus contraignant fixe le decoupage du segment
    segment.pieces = _pieces_for(
        segment,
        min((decisions[i] for i in active), key=lambda d: d.model.max_seconds or math.inf),
        video_seconds,
    )
    for piece in segment.pieces:
        piece.calls = [
            EditCall(index, decisions[index].model.key, decisions[index].tier.key)
            for index in active
        ]
    warnings = []
    if len(segment.pieces) > 1:
        warnings.append(
            f"Segment {start:g} à {end:g} s découpé en {len(segment.pieces)} morceaux : "
            "de légères différences d'apparence sont possibles entre les morceaux."
        )
    if any(p.render_end - p.render_start > p.end - p.start + _EPSILON for p in segment.pieces):
        warnings.append(
            f"Segment {start:g} à {end:g} s plus court que le minimum du modèle : rendu "
            "avec du contexte puis recoupé (le contexte est facturé)."
        )
    return segment, warnings


def build_plan(
    edits: list[EditRequest],
    video_seconds: float,
    *,
    quality: str = "standard",
    aspect_ratio: str = "16:9",
    preferred_model: str = "auto",
    router=choose_model,
) -> JobPlan:
    """Construit le plan de montage (leve ``NoModelAvailable`` si une modif est impossible)."""
    windows, assumptions = _windows(edits, video_seconds)
    decisions = [
        router(
            RouteRequest(
                intent=edit.intent,
                window_seconds=max(end - start, _EPSILON),
                video_seconds=video_seconds,
                quality=quality,
                aspect_ratio=aspect_ratio,
                preferred_model=preferred_model,
            )
        )
        for edit, (start, end) in zip(edits, windows, strict=True)
    ]
    segments: list[Segment] = []
    warnings: list[str] = []
    for start, end in pairwise(_split_points(windows, video_seconds)):
        segment, notes = _segment(start, end, windows, decisions, video_seconds)
        segments.append(segment)
        warnings.extend(notes)
    return JobPlan(
        video_seconds,
        [
            {
                "index": index,
                "instruction": edit.prompt_source,
                "intent": edit.intent,
                "start": round(windows[index][0], 3),
                "end": round(windows[index][1], 3),
                "route": decisions[index].as_dict(),
            }
            for index, edit in enumerate(edits)
        ],
        segments,
        warnings,
        assumptions,
    )
