"""Plan de calques : positions, tailles et rotations deterministes.

Portage du generateur du studio client (`rng` + `draw`). Le plan est un **JSON
pur** (aucun rendu image cote serveur) : le navigateur dessine les calques sur
un canvas a partir des positions calculees ici. Une meme graine produit
exactement le meme plan.
"""

import math
import random
import re
from dataclasses import dataclass

from .search import normalize

_MASK = 0xFFFFFFFF
_MAX_DIMENSION = 8192
_MAX_QUANTITY = 200
_MIN_SIZE = 8
_MAX_SIZE = 1200


@dataclass(frozen=True)
class LayerOptions:
    """Options de composition des calques (dimensions, style, disposition)."""

    width: int = 960
    height: int = 540
    size: int = 112
    rotation: int = 0
    opacity: int = 100
    placement: str = "random"
    seed: int | str | None = None


def _imul(left: int, right: int) -> int:
    """Multiplication 32 bits (equivalent de Math.imul)."""
    return ((left & _MASK) * (right & _MASK)) & _MASK


def make_rng(seed):
    """Generateur deterministe (mulberry32), ou `random.random` si aucune graine."""
    if seed is None or seed == "":
        return random.random
    try:
        state = int(seed) & _MASK
    except (TypeError, ValueError):
        return random.random
    if state == 0:
        state = 0x6D2B79F5

    def _next() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & _MASK
        value = state
        value = _imul(value ^ (value >> 15), value | 1)
        value = ((value + _imul(value ^ (value >> 7), value | 61)) & _MASK) ^ value
        return ((value ^ (value >> 14)) & _MASK) / 4294967296

    return _next


def safe_name(text: str) -> str:
    """Nom de fichier sur a partir d'un libelle d'emoji."""
    name = normalize(text).replace(" ", "-")
    name = re.sub(r"[^a-z0-9-]", "", name)[:55]
    return name or "emoji"


def _clamp(value, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return minimum
    return max(minimum, min(maximum, number))


class _LayerBuilder:
    """Construit les calques a partir d'options figees et d'un generateur."""

    def __init__(self, options: LayerOptions) -> None:
        self.options = options
        self.width = _clamp(options.width, 1, _MAX_DIMENSION)
        self.height = _clamp(options.height, 1, _MAX_DIMENSION)
        self.rng = make_rng(options.seed)

    @property
    def size(self) -> int:
        """Taille de l'emoji, bornee."""
        return _clamp(self.options.size, _MIN_SIZE, _MAX_SIZE)

    @property
    def placement(self) -> str:
        """Disposition des emojis (``random`` ou ``center``)."""
        return (
            self.options.placement if self.options.placement in {"random", "center"} else "random"
        )

    def _positions(self, count: int) -> list[dict]:
        pad = self.size * 0.55
        points = []
        for index in range(count):
            if self.placement == "center":
                radius = min(self.width, self.height) * 0.2 if count > 1 else 0.0
                angle = 2 * math.pi * index / count - math.pi / 2
                x = self.width / 2 + math.cos(angle) * radius
                y = self.height / 2 + math.sin(angle) * radius
            else:
                x = pad + self.rng() * max(0.0, self.width - 2 * pad)
                y = pad + self.rng() * max(0.0, self.height - 2 * pad)
            points.append({"x": round(x, 2), "y": round(y, 2)})
        return points

    def build(self, item: dict, index: int) -> dict:
        """Construit un calque a partir d'un emoji (et d'eventuelles surcharges)."""
        count = _clamp(item.get("quantity") or 1, 1, _MAX_QUANTITY)
        label = item.get("label_fr") or item.get("label_en") or item["emoji"]
        return {
            "emoji": item["emoji"],
            "name": f"{index + 1:02d}-{safe_name(label)}.png",
            "label": label,
            "quantity": count,
            "size": self.size,
            "rotation": _clamp(self.options.rotation, -360, 360),
            "opacity": _clamp(self.options.opacity, 1, 100),
            "placement": self.placement,
            "positions": self._positions(count),
        }


def plan_layers(items: list[dict], options: LayerOptions | None = None) -> dict:
    """Construit le plan des calques (canvas + positions par emoji).

    Chaque element de ``items`` doit contenir ``emoji`` et peut contenir
    ``label_fr``/``label_en`` (pour le nom) et ``quantity`` (surcharge).
    """
    builder = _LayerBuilder(options or LayerOptions())
    layers = [builder.build(item, index) for index, item in enumerate(items)]
    return {"canvas": {"width": builder.width, "height": builder.height}, "layers": layers}
