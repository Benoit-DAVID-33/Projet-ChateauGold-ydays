"""Recherche d'emojis : normalisation, alias FR/EN et classement par pertinence.

Portage fidele de la logique du studio client (`emoji-studio.html`) afin que le
backend et le navigateur renvoient les memes resultats.
"""

import re
import unicodedata

# Alias bilingues utilises pour elargir une requete (FR <-> EN).
ALIASES = {
    "plane": "avion",
    "airplane": "avion",
    "aeroplane": "avion",
    "avions": "avion",
    "airplanes": "avion",
    "aeroplanes": "avion",
    "car": "voiture",
    "cars": "voiture",
    "automobile": "voiture",
    "automobiles": "voiture",
    "voitures": "voiture",
    "chien": "dog",
    "chiens": "dog",
    "dog": "chien",
    "dogs": "chien",
    "chat": "cat",
    "chats": "cat",
    "cat": "chat",
    "cats": "chat",
}

_APOSTROPHE = re.compile("[\u2019']")
_NON_WORD = re.compile(r"[^\w]+", re.UNICODE)
_SPACES = re.compile(r"\s+")


def normalize(text: object) -> str:
    """Normalise un texte : minuscules, sans accents, sans ponctuation."""
    value = unicodedata.normalize("NFKD", str(text or ""))
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower()
    value = _APOSTROPHE.sub(" ", value)
    value = _NON_WORD.sub(" ", value).replace("_", " ")
    return _SPACES.sub(" ", value).strip()


def alias_queries(query: str) -> list[str]:
    """Retourne la requete normalisee puis ses variantes via les alias."""
    words = normalize(query).split(" ")
    candidates = [normalize(query)]
    candidates.extend(ALIASES[word] for word in words if word in ALIASES)
    seen: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in seen:
            seen.append(candidate)
    return seen


def _field_score(field: str, query: str, weights: tuple[int, int, int, int, int]) -> int:
    """Score d'un champ (label ou tag) pour une requete, selon les poids donnes."""
    exact, word, prefix, contains, all_tokens = weights
    if field == query:
        return exact
    if query in field.split(" "):
        return word
    if field.startswith(query):
        return prefix
    if query in field and len(query) > 2:
        return contains
    tokens = query.split(" ")
    if len(tokens) > 1 and all(token in field for token in tokens):
        return all_tokens
    return 0


_LABEL_WEIGHTS = (1500, 1250, 850, 500, 400)
_TAG_WEIGHTS = (1000, 900, 700, 420, 350)


def rank_matches(dataset: list[dict], query: str, limit: int = 72) -> list[dict]:
    """Classe les emojis par pertinence pour une requete (labels puis tags)."""
    queries = alias_queries(query)
    if not queries:
        return []

    ranked: list[tuple[float, str, dict]] = []
    for item in dataset:
        labels = [normalize(item.get("label_fr")), normalize(item.get("label_en"))]
        labels = [label for label in labels if label]
        tags = [
            normalize(tag)
            for tag in (item.get("tags_fr") or [])
            + (item.get("tags_en") or [])
            + (item.get("shortcodes") or [])
        ]
        tags = [tag for tag in tags if tag]

        score = 0.0
        for index, current in enumerate(queries):
            weight = 1.0 if index == 0 else 0.72
            best = 0
            for field in labels:
                best = max(best, _field_score(field, current, _LABEL_WEIGHTS))
            for field in tags:
                best = max(best, _field_score(field, current, _TAG_WEIGHTS))
            score = max(score, best * weight)

        if score:
            label = normalize(item.get("label_fr") or item.get("label_en") or "")
            ranked.append((score, label, item))

    ranked.sort(key=lambda entry: (-entry[0], entry[1]))
    return [item for _, _, item in ranked[:limit]]
