"""Tests unitaires de la fusion des jeux emojibase FR/EN (sans reseau)."""

from server.emoji.dataset import merge_languages, reset_cache


def test_merge_languages_joins_by_emoji():
    english = [{"emoji": "🚗", "label": "automobile", "tags": ["car"], "shortcodes": [":car:"]}]
    french = [{"emoji": "🚗", "label": "voiture", "tags": ["véhicule"]}]
    merged = merge_languages(english, french)
    assert len(merged) == 1
    item = merged[0]
    assert item["label_en"] == "automobile"
    assert item["label_fr"] == "voiture"
    assert item["tags_en"] == ["car"]
    assert item["tags_fr"] == ["véhicule"]
    assert item["shortcodes"] == [":car:"]


def test_merge_languages_ignores_rows_without_emoji():
    assert merge_languages([{"label": "sans emoji"}], []) == []


def test_merge_languages_falls_back_to_annotation():
    merged = merge_languages([{"emoji": "🐶", "annotation": "dog face"}], [])
    assert merged[0]["label_en"] == "dog face"


def test_reset_cache_is_safe():
    reset_cache()
