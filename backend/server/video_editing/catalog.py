"""Catalogue des modeles d'edition video : **source unique de verite**.

Chaque fiche decrit ce qu'un modele sait *reellement* faire : formats et
durees acceptes, niveaux de qualite **reellement** proposes par son API (une
qualite absente de la fiche n'est jamais affichee), prix indicatif et niveau
de preuve de chaque information. Le routeur (``routing``), le decoupage
(``planner``), les options affichees au client et la documentation
``docs/specs_modeles.md`` (generee par ``scripts/generate_model_specs.py``)
lisent tous ces fiches : on ne peut pas promettre une option qui n'existe pas.

Niveaux de preuve : ``doc`` (documentation officielle du fournisseur ou de
l'hebergeur), ``tiers`` (revendeur / agregateur), ``inconnu`` (non publie).
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Intentions reconnues par le triage (voir ``server.prompts.triage``).
EDIT_INTENTS = (
    "add",
    "remove",
    "replace",
    "recolor",
    "restyle",
    "background",
    "weather",
    "relight",
    "angle",
    "next_shot",
    "previous_shot",
    "generic",
)

QUALITY_ORDER = ("draft", "standard", "pro", "4k")
# Libelles affiches aux utilisateurs (les cles restent techniques).
QUALITY_LABELS = {
    "draft": "Rapide",
    "standard": "HD",
    "pro": "Full HD",
    "4k": "4K",
}
# Resolution annoncee par niveau dans l'interface.
NOMINAL_RESOLUTION = {"draft": "540p", "standard": "720p", "pro": "1080p", "4k": "2160p"}


@dataclass(frozen=True)
class QualityTier:
    """Un niveau de qualite **reellement** expose par l'API du modele."""

    key: str
    resolution: str
    params: dict = field(default_factory=dict)
    price_usd_per_second: float | None = None
    price_evidence: str = "inconnu"

    @property
    def label(self) -> str:
        """Libelle affiche : « Pro · 1080p »."""
        return f"{QUALITY_LABELS[self.key]} · {self.resolution}"


@dataclass(frozen=True)
class VideoModel:  # pylint: disable=too-many-instance-attributes
    """Fiche d'un modele d'edition video pilotable par prompt.

    Enregistrement de donnees pur (une colonne par caracteristique documentee) :
    le regrouper en sous-objets rendrait le catalogue plus difficile a relire.
    """

    key: str
    label: str
    vendor: str
    provider: str
    endpoint: str
    prompt_profile: str
    video_reference: str
    input_formats: tuple[str, ...]
    min_seconds: float
    max_seconds: float | None
    max_megabytes: int
    tiers: tuple[QualityTier, ...]
    strengths: frozenset[str]
    evidence: str
    sources: tuple[str, ...]
    integrated: bool = True
    time_window: bool = False
    aspect_ratios: tuple[str, ...] = ()
    negative_prompt: bool = False
    keeps_audio: bool = True
    image_references: int = 0
    notes: tuple[str, ...] = ()

    def tier(self, key: str) -> QualityTier | None:
        """Retourne le niveau de qualite demande, ou None s'il n'existe pas."""
        return next((tier for tier in self.tiers if tier.key == key), None)

    @property
    def quality_keys(self) -> tuple[str, ...]:
        """Niveaux disponibles, du plus bas au plus haut."""
        return tuple(key for key in QUALITY_ORDER if self.tier(key))

    def accepts_duration(self, seconds: float) -> bool:
        """Indique si un segment de cette duree est accepte tel quel."""
        too_long = self.max_seconds is not None and seconds > self.max_seconds
        return seconds >= self.min_seconds and not too_long


_KLING_STRENGTHS = frozenset(
    {
        "add",
        "remove",
        "replace",
        "recolor",
        "restyle",
        "background",
        "angle",
        "next_shot",
        "previous_shot",
        "generic",
    }
)

MODELS: dict[str, VideoModel] = {
    "kling-o1": VideoModel(
        key="kling-o1",
        label="Kling VIDEO O1 (Omni, API Kling directe)",
        vendor="Kuaishou / Kling AI",
        provider="kling",
        endpoint="POST /v1/videos/omni-video (model_name=kling-video-o1)",
        prompt_profile="kling",
        video_reference="<<<video_1>>>",
        input_formats=("mp4", "mov"),
        min_seconds=3,
        max_seconds=10,
        max_megabytes=200,
        tiers=(
            QualityTier("standard", "720p", {"mode": "std"}, 0.078, "tiers"),
            QualityTier("pro", "1080p", {"mode": "pro"}, 0.104, "tiers"),
        ),
        strengths=_KLING_STRENGTHS,
        evidence="doc",
        sources=(
            "https://kling.ai/quickstart/klingai-video-o1-user-guide",
            "https://piapi.ai/kling-o1",
        ),
        negative_prompt=True,
        image_references=4,
        notes=(
            "Nécessite PUBLIC_BASE_URL : Kling télécharge la vidéo depuis une URL publique.",
            "En édition (refer_type=base) la durée de sortie est celle du segment envoyé.",
            "Prix : grille d'un revendeur (PiAPI), la grille officielle Kling n'est pas publique.",
        ),
    ),
    "kling-o3-edit": VideoModel(
        key="kling-o3-edit",
        label="Kling O3 Edit (via fal.ai)",
        vendor="Kuaishou / Kling AI",
        provider="fal",
        endpoint="fal-ai/kling-video/o3/{standard|pro|4k}/video-to-video/edit",
        prompt_profile="kling",
        video_reference="@Video1",
        input_formats=("mp4", "mov"),
        min_seconds=3,
        max_seconds=15,
        max_megabytes=200,
        tiers=(
            QualityTier(
                "standard",
                "720p",
                {"endpoint": "fal-ai/kling-video/o3/standard/video-to-video/edit"},
                0.126,
                "doc",
            ),
            QualityTier(
                "pro",
                "1080p",
                {"endpoint": "fal-ai/kling-video/o3/pro/video-to-video/edit"},
                0.168,
                "doc",
            ),
            QualityTier(
                "4k",
                "2160p",
                {"endpoint": "fal-ai/kling-video/o3/4k/video-to-video/edit"},
                0.42,
                "doc",
            ),
        ),
        strengths=_KLING_STRENGTHS,
        evidence="doc",
        sources=(
            "https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit/llms.txt",
            "https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/llms.txt",
            "https://fal.ai/models/fal-ai/kling-video/o3/4k/video-to-video/edit/llms.txt",
        ),
        image_references=4,
        notes=(
            "La vidéo se référence par @Video1 (et non <<<video_1>>> comme l'API Kling directe).",
            "Résolution source acceptée : 720 à 3840 px.",
            "Résolution de sortie par niveau déduite du nom de l'offre (non chiffrée par fal).",
        ),
    ),
    "ltx-2.3-retake": VideoModel(
        key="ltx-2.3-retake",
        label="LTX 2.3 Retake (via fal.ai) — édition d'une fenêtre temporelle",
        vendor="Lightricks",
        provider="fal",
        endpoint="fal-ai/ltx-2.3/retake-video",
        prompt_profile="generic",
        video_reference="",
        input_formats=("mp4", "mov"),
        min_seconds=2,
        max_seconds=20,
        max_megabytes=200,
        tiers=(QualityTier("standard", "résolution source", {}, None, "inconnu"),),
        strengths=frozenset({"add", "replace", "generic", "next_shot"}),
        evidence="doc",
        sources=(
            "https://fal.ai/models/fal-ai/ltx-2.3/retake-video/api",
            "https://fal.ai/models/fal-ai/ltx-2/retake-video/llms.txt",
        ),
        time_window=True,
        notes=(
            "Régénère seulement [start_time, start_time + duration] : le reste de la vidéo "
            "est conservé par le modèle (pas de découpage nécessaire).",
            "Bornes 2 à 20 s relevées sur un miroir tiers, non confirmées par fal.",
            "Prix non publié pour LTX 2.3 (LTX 2 : 0,10 $/s).",
        ),
    ),
    "lucy-2.6": VideoModel(
        key="lucy-2.6",
        label="Decart Lucy 2.6 (API Decart)",
        vendor="Decart",
        provider="decart",
        endpoint="POST https://api.decart.ai/v1/jobs/lucy-2.6",
        prompt_profile="decart",
        video_reference="",
        input_formats=("mp4",),
        min_seconds=0.5,
        max_seconds=None,
        max_megabytes=200,
        tiers=(QualityTier("standard", "720p", {"resolution": "720p"}, 0.04, "doc"),),
        strengths=frozenset({"replace", "recolor", "add", "restyle", "generic"}),
        evidence="doc",
        sources=("https://docs.platform.decart.ai/models/video/video-editing",),
        aspect_ratios=("16:9", "9:16"),
        image_references=1,
        notes=(
            "Durée illimitée, mais 720p uniquement et ratio 16:9 ou 9:16.",
            "Très économique pour les changements locaux (tenue, objet, couleur).",
        ),
    ),
    "luma-ray-3.2": VideoModel(
        key="luma-ray-3.2",
        label="Luma Ray 3.2 Modify (API Luma)",
        vendor="Luma AI",
        provider="luma",
        endpoint="POST https://agents.lumalabs.ai/v1/generations (type=video_edit)",
        prompt_profile="luma",
        video_reference="",
        input_formats=("mp4", "mov", "webm"),
        min_seconds=1,
        max_seconds=18,
        max_megabytes=200,
        tiers=(
            QualityTier("draft", "540p", {"resolution": "540p"}, None, "inconnu"),
            QualityTier("standard", "720p", {"resolution": "720p"}, None, "inconnu"),
            QualityTier("pro", "1080p", {"resolution": "1080p"}, None, "inconnu"),
        ),
        strengths=frozenset({"restyle", "relight", "weather", "background", "generic"}),
        evidence="doc",
        sources=("https://docs.agents.lumalabs.ai/guides/videos/editing/",),
        notes=(
            "Fidélité réglée par strength (adhere / flex / reimagine), pas par le prompt.",
            "HDR possible en 720p et 1080p (option hdr).",
            "Prix non chiffré sur la page d'édition (grille Luma séparée).",
        ),
    ),
    # --- Modeles references mais NON integres (aucun adaptateur dans ce backend) ---
    "runway-aleph-2": VideoModel(
        key="runway-aleph-2",
        label="Runway Aleph 2.0",
        vendor="Runway",
        provider="runway",
        endpoint="video_to_video (model=aleph2)",
        prompt_profile="runway",
        video_reference="",
        input_formats=("mp4",),
        min_seconds=2,
        max_seconds=30,
        max_megabytes=16,
        tiers=(QualityTier("pro", "1080p", {}, None, "inconnu"),),
        strengths=frozenset({"restyle", "relight", "angle", "next_shot", "replace"}),
        evidence="tiers",
        sources=("https://docs.dev.runwayml.com/api-details/api_changelog/",),
        integrated=False,
        notes=("Non intégré : paramètres exacts de l'API aleph2 non confirmés.",),
    ),
    "seedance-2.5-edit": VideoModel(
        key="seedance-2.5-edit",
        label="Seedance 2.5 (mode édition)",
        vendor="ByteDance",
        provider="seedance",
        endpoint="bytedance/seedance-2.5/video-edit",
        prompt_profile="seedance",
        video_reference="",
        input_formats=("mp4",),
        min_seconds=1,
        max_seconds=None,
        max_megabytes=0,
        tiers=(),
        strengths=frozenset({"add", "remove", "replace", "restyle", "relight"}),
        evidence="tiers",
        sources=("https://runware.ai/docs/models/bytedance-seedance-2-5/guides/editing",),
        integrated=False,
        notes=("Non intégré : limites et qualités non documentées de façon officielle.",),
    ),
    "grok-imagine-video": VideoModel(
        key="grok-imagine-video",
        label="xAI Grok Imagine (édition)",
        vendor="xAI",
        provider="xai",
        endpoint="grok-imagine-video",
        prompt_profile="xai",
        video_reference="",
        input_formats=("mp4",),
        min_seconds=1,
        max_seconds=8.7,
        max_megabytes=0,
        tiers=(QualityTier("standard", "720p max", {}, None, "inconnu"),),
        strengths=frozenset({"add", "replace", "restyle"}),
        evidence="doc",
        sources=("https://docs.x.ai/developers/model-capabilities/video/editing",),
        integrated=False,
        notes=("Non intégré. Durée, ratio et résolution suivent la source (720p max).",),
    ),
}


def integrated_models() -> list[VideoModel]:
    """Modeles disposant d'un adaptateur dans ce backend."""
    return [model for model in MODELS.values() if model.integrated]


def get_model(key: str) -> VideoModel | None:
    """Retourne une fiche par sa cle."""
    return MODELS.get(key)


def public_quality_options(included: tuple[str, ...], available: set[str]) -> list[dict]:
    """Qualites pour l'interface, sans aucun nom de modele.

    ``included`` : niveaux de l'offre de l'utilisateur ; ``available`` : cles des
    modeles reellement utilisables. Un niveau n'est liste que si un modele
    integre le propose ; ``available`` indique s'il est utilisable maintenant.
    """
    options = []
    for key in QUALITY_ORDER:
        offering = [model for model in integrated_models() if model.tier(key) is not None]
        if not offering:
            continue
        options.append(
            {
                "key": key,
                "label": QUALITY_LABELS[key],
                "resolution": NOMINAL_RESOLUTION[key],
                "included": key in included,
                "available": any(model.key in available for model in offering),
            }
        )
    return options


def quality_options() -> list[dict]:
    """Options de qualite reellement disponibles (pour l'interface), par niveau.

    Un niveau n'apparait que si au moins un modele integre le propose ; pour
    chacun on liste les modeles, la resolution et le prix indicatif reels.
    """
    options = []
    for key in QUALITY_ORDER:
        offers = [
            {
                "model": model.key,
                "label": model.label,
                "resolution": tier.resolution,
                "price_usd_per_second": tier.price_usd_per_second,
                "price_evidence": tier.price_evidence,
            }
            for model in integrated_models()
            if (tier := model.tier(key)) is not None
        ]
        if offers:
            options.append({"key": key, "label": QUALITY_LABELS[key], "models": offers})
    return options
