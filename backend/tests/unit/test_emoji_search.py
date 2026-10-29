"""Tests unitaires de la recherche d'emojis (normalisation, alias, classement)."""

from server.emoji.search import alias_queries, normalize, rank_matches

DATASET = [
    {
        "emoji": "🚗",
        "label_fr": "voiture",
        "label_en": "automobile",
        "tags_fr": ["véhicule"],
        "tags_en": ["car"],
        "shortcodes": [":car:"],
    },
    {
        "emoji": "✈️",
        "label_fr": "avion",
        "label_en": "airplane",
        "tags_fr": ["vol"],
        "tags_en": ["plane"],
        "shortcodes": [],
    },
    {
        "emoji": "🐶",
        "label_fr": "chien",
        "label_en": "dog",
        "tags_fr": [],
        "tags_en": [],
        "shortcodes": [],
    },
]


def test_normalize_strips_accents_and_punctuation():
    assert normalize("Voiture à 4 roues !") == "voiture a 4 roues"
    assert normalize(None) == ""
    assert normalize("  CHÂTEAU  ") == "chateau"


def test_alias_queries_expands_bilingual_terms():
    assert alias_queries("plane")[0] == "plane"
    assert "avion" in alias_queries("plane")
    assert "voiture" in alias_queries("car")


def test_rank_matches_by_french_label():
    results = rank_matches(DATASET, "voiture")
    assert results[0]["emoji"] == "🚗"


def test_rank_matches_through_english_alias():
    results = rank_matches(DATASET, "plane")
    assert results[0]["emoji"] == "✈️"


def test_rank_matches_by_tag():
    assert rank_matches(DATASET, "vehicule")[0]["emoji"] == "🚗"


def test_rank_matches_empty_query_returns_nothing():
    assert rank_matches(DATASET, "") == []
    assert rank_matches(DATASET, "   ") == []


def test_rank_matches_respects_limit():
    assert len(rank_matches(DATASET, "e", limit=1)) <= 1
