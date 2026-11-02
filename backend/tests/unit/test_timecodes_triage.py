"""Tests du pre-traitement : reperes temporels, jargon cinema et tri des demandes."""

import pytest

from server.prompts import cinema, timecodes, triage


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("0:15", 15.0),
        ("1:02:03", 3723.0),
        ("1 min 30", 90.0),
        ("2 s", 2.0),
        ("2,5 secondes", 2.5),
        ("deux secondes", 2.0),
        ("deuxième seconde", 2.0),
    ],
)
def test_parse_value(text, expected):
    assert timecodes.parse_value(text) == expected


@pytest.mark.parametrize(
    ("text", "start", "end", "length", "anchor", "rest"),
    [
        ("à la 2e seconde intègre un chevalier", 2.0, None, None, "", "intègre un chevalier"),
        ("à 15 s rajoute un dragon", 15.0, None, None, "", "rajoute un dragon"),
        ("de 3 à 5 s enlève le logo", 3.0, 5.0, None, "", "enlève le logo"),
        ("entre 10 et 12 secondes mets la nuit", 10.0, 12.0, None, "", "mets la nuit"),
        ("pendant 4 secondes mets la nuit", None, None, 4.0, "", "mets la nuit"),
        ("à 0:20 ajoute de la neige", 20.0, None, None, "", "ajoute de la neige"),
        ("à la fin fais un fondu au noir", None, None, None, "end", "fais un fondu au noir"),
        ("at 3s add a hat", 3.0, None, None, "", "add a hat"),
    ],
)
def test_extract_windows(text, start, end, length, anchor, rest):
    window, cleaned = timecodes.extract(text)
    assert (window.start, window.end, window.length, window.anchor) == (start, end, length, anchor)
    assert cleaned == rest


def test_extract_ignores_non_time_prepositions():
    window, cleaned = timecodes.extract("ajoute un chapeau à l'homme")
    assert not window.is_set
    assert cleaned == "ajoute un chapeau à l'homme"


def test_resolve_open_window_runs_to_end():
    start, end, notes = timecodes.TimeWindow(start=2.0).resolve(20.0)
    assert (start, end) == (2.0, 20.0)
    assert "jusqu'à la fin" in notes[0]


def test_resolve_end_anchor_and_clamping():
    assert timecodes.TimeWindow(anchor="end").resolve(12.0)[:2] == (7.0, 12.0)
    assert timecodes.TimeWindow(start=30.0, end=40.0).resolve(20.0)[:2] == (20.0, 20.0)
    assert timecodes.TimeWindow(length=4.0).resolve(10.0)[:2] == (0.0, 4.0)


def test_cinema_detects_longest_terms_first():
    terms = cinema.detect("travelling avant en contre-plongée, étalonnage teal & orange")
    english = [term.english for term in terms]
    assert "slow dolly in" in english
    assert "low-angle shot" in english
    assert "teal and orange color grade" in english
    assert "tracking shot" not in english  # « travelling » seul est couvert par le terme long


def test_cinema_glossary_only_lists_detected_terms():
    assert cinema.glossary_for_llm([]) == ""
    block = cinema.glossary_for_llm(cinema.detect("un gros plan"))
    assert "close-up" in block


def test_triage_splits_timed_edits():
    result = triage.analyze("à la 2e seconde intègre un chevalier puis à la 15 s rajoute un dragon")
    assert [edit.intent for edit in result.edits] == ["add", "add"]
    assert [edit.timing for edit in result.edits] == [{"start": 2.0}, {"start": 15.0}]
    assert result.edits[1].instruction == "rajoute un dragon"
    assert result.language == "fr"


def test_triage_asks_questions_when_vague():
    result = triage.analyze("fais quelque chose de joli")
    assert result.edits[0].intent == "generic"
    assert result.questions


def test_triage_reports_cinema_terms():
    result = triage.analyze("passe en plan large avec un contre-jour")
    assert {term["english"] for term in result.cinema_terms} >= {
        "wide shot",
        "backlight, rim light",
    }
