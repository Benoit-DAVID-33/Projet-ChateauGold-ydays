"""Jeu de donnees emojibase (FR + EN), charge et mis en cache.

Le telechargement se fait via CDN (jsDelivr, puis unpkg en repli). Le resultat
est mis en cache en memoire (TTL long) ; si ``EMOJI_DATA_FILE`` est defini, le
fichier local est utilise a la place du reseau. ``httpx`` est importe a la
demande pour ne pas penaliser le demarrage.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from .. import config
from ..caching import TTLCache

logger = logging.getLogger("goldfx")

_CACHE_KEY = "emoji-dataset"
_cache = TTLCache(default_ttl=config.EMOJI_CACHE_TTL, max_size=2)


class EmojiDataError(Exception):
    """Impossible de charger les donnees emoji."""


def merge_languages(english: list[dict], french: list[dict]) -> list[dict]:
    """Fusionne les jeux EN et FR en une liste unique indexee par emoji."""
    merged: dict[str, dict] = {}
    for rows, lang in ((english, "en"), (french, "fr")):
        for row in rows:
            if not isinstance(row, dict):
                continue
            emoji = row.get("emoji") or row.get("unicode")
            if not emoji:
                continue
            item = merged.setdefault(
                emoji, {"emoji": emoji, "tags_en": [], "tags_fr": [], "shortcodes": []}
            )
            item[f"label_{lang}"] = row.get("label") or row.get("annotation") or ""
            tags = row.get("tags")
            if isinstance(tags, list):
                item[f"tags_{lang}"] = tags
            shortcodes = row.get("shortcodes")
            if isinstance(shortcodes, list):
                for code in shortcodes:
                    if code not in item["shortcodes"]:
                        item["shortcodes"].append(code)
    return list(merged.values())


async def _fetch_language(lang: str) -> list[dict]:
    """Telecharge le jeu d'une langue en essayant les URLs configurees."""
    import httpx  # import differe

    last_error: Exception | None = None
    for template in config.EMOJI_DATA_URLS:
        url = template.format(lang=lang)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list) and data:
                return data
            raise ValueError("format inattendu")
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            logger.warning("Emoji : echec du chargement de %s (%s)", url, exc)

    raise EmojiDataError(f"Impossible de charger les données emoji « {lang} »") from last_error


def _load_local() -> list[dict] | None:
    """Charge le jeu depuis un fichier local si configure (aucun reseau)."""
    if not config.EMOJI_DATA_FILE:
        return None
    path = Path(config.EMOJI_DATA_FILE)
    if not path.exists():
        logger.warning("Emoji : fichier local introuvable (%s)", path)
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Emoji : fichier local illisible (%s) : %s", path, exc)
        return None
    return data if isinstance(data, list) else None


async def _load_dataset() -> list[dict]:
    local = _load_local()
    if local is not None:
        return local
    english, french = await asyncio.gather(_fetch_language("en"), _fetch_language("fr"))
    return merge_languages(english, french)


async def get_dataset() -> list[dict]:
    """Retourne le jeu d'emojis (cache memoire, telecharge une seule fois)."""
    cached = _cache.get(_CACHE_KEY)
    if cached is not None:
        return cached
    dataset = await _load_dataset()
    _cache.set(_CACHE_KEY, dataset)
    return dataset


def reset_cache() -> None:
    """Vide le cache des donnees emoji (utile en tests)."""
    _cache.clear()
