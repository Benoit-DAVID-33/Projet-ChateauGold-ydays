"""Tests unitaires de l'analyse d'une composition emoji en langage naturel."""

from server.emoji.prompt import parse_prompt


def test_parse_digits_and_conjunction():
    assert parse_prompt("2 voitures et un avion") == [
        {"query": "voitures", "count": 2},
        {"query": "avion", "count": 1},
    ]


def test_parse_quantity_words_french():
    assert parse_prompt("deux chats") == [{"query": "chats", "count": 2}]


def test_parse_quantity_words_english():
    assert parse_prompt("three dogs") == [{"query": "dogs", "count": 3}]


def test_parse_with_accents():
    assert parse_prompt("5 étoiles") == [{"query": "etoiles", "count": 5}]


def test_parse_multiple_mentions():
    assert parse_prompt("un chien et deux chats") == [
        {"query": "chien", "count": 1},
        {"query": "chats", "count": 2},
    ]


def test_parse_empty_prompt():
    assert parse_prompt("") == []
    assert parse_prompt("et and plus") == []


def test_parse_clamps_quantity():
    assert parse_prompt("999 voitures")[0]["count"] == 200
