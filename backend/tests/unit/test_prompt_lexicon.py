"""Tests unitaires du lexique francais -> anglais (prompt engineering hors ligne)."""

import pytest

from server.prompts import lexicon as prompt_lexicon


@pytest.mark.parametrize(
    ("french", "english"),
    [
        ("un chapeau rouge", "a red hat"),
        ("la personne derrière", "the person behind"),
        ("une veste en cuir noir", "a black leather jacket"),
        ("les arbres verts", "the green trees"),
        ("des lunettes de soleil", "sunglasses"),
        ("la couleur de la voiture", "the color of the car"),
        ("un arc-en-ciel", "a rainbow"),
        ("une plage tropicale au coucher de soleil", "a tropical beach at sunset"),
        ("le logo en haut à droite", "the logo in the top right corner"),
        ("de la neige", "snow"),
        ("une orange", "an orange"),
    ],
)
def test_translate_known_fragments(french, english):
    assert prompt_lexicon.translate(french) == (english, True)


def test_translate_reports_unknown_words():
    text, complete = prompt_lexicon.translate("des chaussons zébrés")
    assert complete is False
    assert "zébrés" in text


def test_proper_nouns_and_numbers_are_kept():
    assert prompt_lexicon.translate("le logo Nike") == ("the logo Nike", True)
    assert prompt_lexicon.translate("deux chats") == ("two cats", True)


def test_tokenize_splits_elisions_and_curly_quotes():
    assert prompt_lexicon.tokenize(f"l{chr(0x2019)}homme") == ["l'", "homme"]


def test_looks_english():
    assert prompt_lexicon.looks_english("remove the man with the hat")
    assert not prompt_lexicon.looks_english("enlève le chat de la vidéo")


def test_en_before_a_noun_means_in():
    assert prompt_lexicon.translate("un chevalier en armure") == ("a knight in armor", True)
    assert prompt_lexicon.translate("une veste en cuir") == ("a leather jacket", True)
