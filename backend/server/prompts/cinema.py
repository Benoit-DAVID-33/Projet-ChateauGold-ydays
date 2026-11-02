"""Jargon cinema francais -> vocabulaire anglais compris des modeles video.

Les modeles video sont entraines sur des descriptions anglaises de tournage :
« dolly in », « low-angle shot », « teal and orange grade »... Un monteur
francais ecrit « travelling avant », « contre-plongee », « etalonnage
teal & orange ». Ce glossaire :

- alimente la traduction hors ligne (``lexicon.PHRASES``) ;
- n'injecte dans la consigne du LLM **que** les termes detectes dans la
  demande (consigne courte = reponse plus fiable et moins couteuse).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class CinemaTerm:
    """Terme de metier : expression francaise, equivalent anglais et categorie."""

    french: str
    english: str
    category: str


TERMS: tuple[CinemaTerm, ...] = (
    # Valeurs de plan
    CinemaTerm("plan d'ensemble", "establishing wide shot", "cadrage"),
    CinemaTerm("plan large", "wide shot", "cadrage"),
    CinemaTerm("plan moyen", "medium shot", "cadrage"),
    CinemaTerm("plan américain", "cowboy shot (mid-thigh up)", "cadrage"),
    CinemaTerm("plan rapproché", "medium close-up", "cadrage"),
    CinemaTerm("gros plan", "close-up", "cadrage"),
    CinemaTerm("très gros plan", "extreme close-up", "cadrage"),
    CinemaTerm("insert", "insert shot", "cadrage"),
    CinemaTerm("plan subjectif", "point-of-view shot", "cadrage"),
    CinemaTerm("champ-contrechamp", "shot / reverse shot", "cadrage"),
    CinemaTerm("plan-séquence", "long take", "cadrage"),
    CinemaTerm("amorce", "over-the-shoulder framing", "cadrage"),
    # Angles
    CinemaTerm("contre-plongée", "low-angle shot", "angle"),
    CinemaTerm("plongée", "high-angle shot", "angle"),
    CinemaTerm("vue zénithale", "top-down overhead shot", "angle"),
    CinemaTerm("plan débullé", "dutch angle", "angle"),
    CinemaTerm("angle hollandais", "dutch angle", "angle"),
    # Mouvements de camera
    CinemaTerm("travelling avant", "slow dolly in", "mouvement"),
    CinemaTerm("travelling arrière", "slow dolly out", "mouvement"),
    CinemaTerm("travelling latéral", "lateral tracking shot", "mouvement"),
    CinemaTerm("travelling", "tracking shot", "mouvement"),
    CinemaTerm("panoramique", "pan", "mouvement"),
    CinemaTerm("tilt", "tilt", "mouvement"),
    CinemaTerm("caméra à l'épaule", "handheld camera", "mouvement"),
    CinemaTerm("steadicam", "steadicam shot", "mouvement"),
    CinemaTerm("plan grue", "crane shot", "mouvement"),
    CinemaTerm("plan drone", "aerial drone shot", "mouvement"),
    CinemaTerm("zoom avant", "zoom in", "mouvement"),
    CinemaTerm("zoom arrière", "zoom out", "mouvement"),
    CinemaTerm("effet vertigo", "dolly zoom (vertigo effect)", "mouvement"),
    # Optique
    CinemaTerm("grand angle", "wide-angle lens", "optique"),
    CinemaTerm("téléobjectif", "telephoto lens", "optique"),
    CinemaTerm("courte focale", "short focal length", "optique"),
    CinemaTerm("longue focale", "long focal length", "optique"),
    CinemaTerm("faible profondeur de champ", "shallow depth of field", "optique"),
    CinemaTerm("profondeur de champ", "depth of field", "optique"),
    CinemaTerm("flou d'arrière-plan", "bokeh background", "optique"),
    CinemaTerm("bascule de point", "focus pull (rack focus)", "optique"),
    CinemaTerm("anamorphique", "anamorphic lens, oval bokeh, horizontal flares", "optique"),
    CinemaTerm("format cinémascope", "2.39:1 cinemascope framing", "optique"),
    # Lumiere
    CinemaTerm("lumière principale", "key light", "lumière"),
    CinemaTerm("contre-jour", "backlight, rim light", "lumière"),
    CinemaTerm("clair-obscur", "chiaroscuro lighting", "lumière"),
    CinemaTerm("éclairage low key", "low-key lighting", "lumière"),
    CinemaTerm("éclairage high key", "high-key lighting", "lumière"),
    CinemaTerm("lumière naturelle", "natural available light", "lumière"),
    CinemaTerm("heure dorée", "golden hour sunlight", "lumière"),
    CinemaTerm("heure bleue", "blue hour", "lumière"),
    CinemaTerm("nuit américaine", "day-for-night", "lumière"),
    CinemaTerm("lumière néon", "neon practical lighting", "lumière"),
    CinemaTerm("lumière volumétrique", "volumetric light rays", "lumière"),
    # Etalonnage / rendu
    CinemaTerm("étalonnage teal and orange", "teal and orange color grade", "étalonnage"),
    CinemaTerm("étalonnage teal & orange", "teal and orange color grade", "étalonnage"),
    CinemaTerm("étalonnage", "color grade", "étalonnage"),
    CinemaTerm("teal and orange", "teal and orange color grade", "étalonnage"),
    CinemaTerm("teal & orange", "teal and orange color grade", "étalonnage"),
    CinemaTerm("désaturé", "desaturated look", "étalonnage"),
    CinemaTerm("grain argentique", "35mm film grain", "étalonnage"),
    CinemaTerm("pellicule 16 mm", "16mm film look", "étalonnage"),
    CinemaTerm("super 8", "Super 8 film look", "étalonnage"),
    CinemaTerm("rendu pellicule", "analog film look", "étalonnage"),
    CinemaTerm("look vintage", "vintage film look", "étalonnage"),
    CinemaTerm("noir et blanc", "black and white", "étalonnage"),
    # Montage / temps
    CinemaTerm("ralenti", "slow motion", "temps"),
    CinemaTerm("accéléré", "time-lapse, fast motion", "temps"),
    CinemaTerm("fondu au noir", "fade to black", "montage"),
    CinemaTerm("fondu enchaîné", "cross-dissolve", "montage"),
    CinemaTerm("raccord", "match cut continuity", "montage"),
    CinemaTerm("faux raccord", "continuity error", "montage"),
    # Effets
    CinemaTerm("incrustation", "seamless compositing", "effets"),
    CinemaTerm("fond vert", "green screen", "effets"),
    CinemaTerm("effets pratiques", "practical effects", "effets"),
    CinemaTerm("fumigène", "atmospheric haze", "effets"),
)

_INDEX = sorted(TERMS, key=lambda term: len(term.french), reverse=True)


def _pattern(term: CinemaTerm) -> re.Pattern:
    escaped = re.escape(term.french).replace(r"\ ", r"[\s-]+").replace(r"\-", r"[\s-]+")
    return re.compile(rf"(?<!\w){escaped}(?!\w)", re.I)


_PATTERNS = [(term, _pattern(term)) for term in _INDEX]


def detect(text: str) -> list[CinemaTerm]:
    """Termes de metier presents dans la demande (le plus long d'abord, sans doublon)."""
    found: list[CinemaTerm] = []
    remaining = text
    for term, pattern in _PATTERNS:
        if pattern.search(remaining):
            found.append(term)
            remaining = pattern.sub(" ", remaining)
    return found


def phrases() -> dict[str, tuple[str, str]]:
    """Entrees pour le lexique de traduction (expression -> (anglais, categorie lexicale))."""
    return {term.french.lower(): (term.english, "n") for term in TERMS}


def glossary_for_llm(terms: list[CinemaTerm]) -> str:
    """Bloc de consigne listant les equivalences detectees (vide si aucune)."""
    if not terms:
        return ""
    lines = "\n".join(f"- « {term.french} » = {term.english}" for term in terms)
    return f"Film vocabulary used by the user (translate faithfully):\n{lines}\n"
