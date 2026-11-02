#!/usr/bin/env python
"""Genere ``docs/specs_modeles.md`` depuis le catalogue (source unique de verite).

Executer depuis ``backend/`` :

    python scripts/generate_model_specs.py          # ecrit le fichier
    python scripts/generate_model_specs.py --check  # echoue si le fichier est perime

Le test ``tests/regression/test_model_specs_doc.py`` lance ``--check`` : la
documentation ne peut donc pas diverger du code.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from server.prompts.enhancer import PROFILES
from server.proxy.registry import _BUILDERS
from server.video_editing.catalog import MODELS, QUALITY_LABELS, VideoModel

TARGET = BACKEND / "docs" / "specs_modeles.md"
EVIDENCE = {
    "doc": "documentation officielle",
    "tiers": "revendeur / agrégateur",
    "inconnu": "non publié",
}
TEXT_PROVIDERS = {
    "local": (
        "Ollama / vLLM / llama.cpp (machine locale)",
        "gratuit",
        "aucune limite hors matériel",
    ),
    "openrouter": (
        "OpenRouter, modèle `:free` imposé",
        "gratuit",
        "≈ 20 req/min, 50 req/jour (source tierce)",
    ),
    "groq": (
        "Groq (`openai/gpt-oss-120b` par défaut)",
        "palier gratuit",
        "≈ 30 req/min, 1 000 req/jour (source tierce)",
    ),
    "gemini": (
        "Google Gemini (endpoint compatible OpenAI)",
        "palier gratuit",
        "limites visibles dans AI Studio",
    ),
    "huggingface": (
        "Hugging Face Inference Providers",
        "payant",
        "facturé au propriétaire du jeton",
    ),
    "kling": ("Kling AI (image / vidéo)", "payant", "crédits du compte Kling"),
    "minimax": ("MiniMax (texte)", "payant", "crédits du compte MiniMax"),
}


def _duration(model: VideoModel) -> str:
    maximum = "illimitée" if model.max_seconds is None else f"{model.max_seconds:g} s"
    return f"{model.min_seconds:g} s → {maximum}"


def _price(value: float | None, evidence: str) -> str:
    if value is None:
        return "non publié"
    return f"{value:.3f} $/s ({EVIDENCE.get(evidence, evidence)})"


def _model_section(model: VideoModel) -> list[str]:
    status = "intégré" if model.integrated else "**non intégré** (référencé seulement)"
    lines = [
        f"### {model.label}",
        "",
        f"- **Clé** : `{model.key}` — {status}",
        f"- **Éditeur** : {model.vendor} — **API** : `{model.endpoint}`",
        f"- **Entrée** : {', '.join(model.input_formats)} · durée {_duration(model)} · "
        f"{model.max_megabytes or '?'} Mo max"
        + (f" · ratio {' / '.join(model.aspect_ratios)}" if model.aspect_ratios else ""),
        f"- **Référence de la vidéo dans le prompt** : `{model.video_reference}`"
        if model.video_reference
        else "- **Référence de la vidéo dans le prompt** : aucune (texte seul)",
        f"- **Fenêtre temporelle native** : {'oui' if model.time_window else 'non'} · "
        f"**prompt négatif** : {'oui' if model.negative_prompt else 'non'} · "
        f"**images de référence** : {model.image_references}",
        f"- **Points forts** : {', '.join(sorted(model.strengths)) or '—'}",
        f"- **Fiche de prompt** : `{model.prompt_profile}` "
        f"({PROFILES[model.prompt_profile].label})",
        f"- **Niveau de preuve** : {EVIDENCE[model.evidence]}",
        "",
    ]
    if model.tiers:
        lines += [
            "| Qualité | Résolution | Paramètres envoyés | Prix indicatif |",
            "| --- | --- | --- | --- |",
        ]
        for tier in model.tiers:
            params = ", ".join(f"`{k}={v}`" for k, v in tier.params.items()) or "—"
            lines.append(
                f"| {QUALITY_LABELS[tier.key]} | {tier.resolution} | {params} | "
                f"{_price(tier.price_usd_per_second, tier.price_evidence)} |"
            )
        lines.append("")
    else:
        lines += ["Aucun niveau de qualité documenté de façon fiable.", ""]
    lines += [f"> {note}" for note in model.notes]
    lines += ["", "Sources : " + ", ".join(f"<{url}>" for url in model.sources), ""]
    return lines


def render() -> str:
    """Contenu complet du markdown."""
    lines = [
        "# Spécifications des modèles utilisés par GOLD FX",
        "",
        "> Fichier **généré** par `scripts/generate_model_specs.py` depuis "
        "`server/video_editing/catalog.py` : ne pas l'éditer à la main.",
        "",
        "## 1. Modèles d'édition vidéo (vidéo → vidéo, pilotés par prompt)",
        "",
        "| Modèle | Intégré | Durée source | Qualités | Prix min. |",
        "| --- | --- | --- | --- | --- |",
    ]
    for model in MODELS.values():
        prices = [t.price_usd_per_second for t in model.tiers if t.price_usd_per_second is not None]
        cheapest = f"{min(prices):.3f} $/s" if prices else "non publié"
        qualities = ", ".join(t.label for t in model.tiers) or "—"
        lines.append(
            f"| {model.label} | {'oui' if model.integrated else 'non'} | {_duration(model)} | "
            f"{qualities} | {cheapest} |"
        )
    lines += [""]
    for model in MODELS.values():
        lines += _model_section(model)
    lines += [
        "## 2. Fournisseurs texte du proxy (prompt engineering, chatbot)",
        "",
        "Avec `LLM_FREE_ONLY=true` (défaut), seuls les fournisseurs gratuits sont appelés.",
        "",
        "| Fournisseur | Description | Facturation | Limites |",
        "| --- | --- | --- | --- |",
    ]
    for name in _BUILDERS:
        description, billing, limits = TEXT_PROVIDERS.get(name, (name, "?", "?"))
        lines.append(f"| `{name}` | {description} | {billing} | {limits} |")
    lines += [
        "",
        "## 3. Formats acceptés par le site",
        "",
        "- **Upload** : MP4, MOV, AVI, MKV, WebM (vidéo) ; JPG, PNG, GIF, BMP, WebP, SVG (image).",
        "- **Édition IA** : la vidéo est découpée et ré-encodée en H.264 (CRF 17, yuv420p) ; "
        "chaque segment est remis à la résolution et à la cadence de la source ; la piste audio "
        "d'origine est conservée sur toute la durée du résultat (MP4, faststart).",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    content = render()
    if "--check" in sys.argv:
        current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if current != content:
            print("docs/specs_modeles.md est périmé : relancez scripts/generate_model_specs.py")
            return 1
        return 0
    TARGET.write_text(content, encoding="utf-8")
    print(f"Écrit : {TARGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
