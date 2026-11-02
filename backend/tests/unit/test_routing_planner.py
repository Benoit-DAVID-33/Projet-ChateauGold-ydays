"""Tests du catalogue, du routage des modeles et du plan de montage."""

import pytest

from server import config
from server.prompts import timecodes
from server.video_editing import catalog
from server.video_editing.planner import EditRequest, build_plan
from server.video_editing.routing import (
    NoModelAvailable,
    RouteRequest,
    choose_model,
    pessimistic_price,
    provider_status,
)


def _all_ready(model):
    return None if model.integrated else "non intégré"


def _only(*keys):
    return lambda model: None if model.key in keys else "désactivé pour le test"


def _request(**kwargs):
    defaults = {"intent": "add", "window_seconds": 5.0, "video_seconds": 20.0}
    return RouteRequest(**{**defaults, **kwargs})


# --- Catalogue ---


def test_quality_options_only_list_real_tiers():
    options = {option["key"]: option for option in catalog.quality_options()}
    assert set(options) == {"draft", "standard", "pro", "4k"}
    four_k = [offer["model"] for offer in options["4k"]["models"]]
    assert four_k == ["kling-o3-edit"]  # seul modele integre a proposer la 4K
    draft = [offer["model"] for offer in options["draft"]["models"]]
    assert draft == ["luma-ray-3.2"]


def test_non_integrated_models_never_offer_quality():
    models = {offer["model"] for o in catalog.quality_options() for offer in o["models"]}
    assert "runway-aleph-2" not in models


def test_model_duration_bounds():
    kling = catalog.get_model("kling-o1")
    assert kling.accepts_duration(5)
    assert not kling.accepts_duration(2)
    assert not kling.accepts_duration(11)
    assert catalog.get_model("lucy-2.6").accepts_duration(600)


# --- Disponibilite reelle ---


def test_provider_status_requires_keys(monkeypatch):
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", False)
    monkeypatch.setattr(config, "FAL_API_KEY", "")
    assert "clé API fal" in provider_status(catalog.get_model("kling-o3-edit"))
    monkeypatch.setattr(config, "FAL_API_KEY", "k")
    assert provider_status(catalog.get_model("kling-o3-edit")) is None


def test_provider_status_kling_needs_public_url(monkeypatch):
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", False)
    monkeypatch.setattr(config, "KLING_ACCESS_KEY", "a")
    monkeypatch.setattr(config, "KLING_SECRET_KEY", "b")
    monkeypatch.setattr(config, "PUBLIC_BASE_URL", "")
    assert "PUBLIC_BASE_URL" in provider_status(catalog.get_model("kling-o1"))


def test_non_integrated_model_is_never_available(monkeypatch):
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", True)
    assert provider_status(catalog.get_model("runway-aleph-2")) == "non intégré dans ce backend"


# --- Routage ---


def test_router_prefers_cheapest_strong_model_at_standard():
    decision = choose_model(_request(), status=_all_ready)
    assert decision.model.key == "lucy-2.6"
    assert decision.tier.key == "standard"
    assert any("coût estimé" in reason for reason in decision.reasons)


def test_router_honours_requested_quality():
    decision = choose_model(_request(quality="4k"), status=_all_ready)
    assert decision.model.key == "kling-o3-edit"
    assert decision.tier.resolution == "2160p"


def test_router_downgrades_quality_and_says_so():
    decision = choose_model(_request(quality="4k"), status=_only("kling-o1"))
    assert decision.tier.key == "pro"
    assert any("indisponible" in reason for reason in decision.reasons)


def test_router_never_upgrades_to_a_more_expensive_tier():
    with pytest.raises(NoModelAvailable):
        choose_model(_request(quality="draft"), status=_only("kling-o1"))


def test_router_rejects_unsupported_aspect_ratio():
    decision = choose_model(_request(aspect_ratio="1:1"), status=_only("lucy-2.6", "kling-o1"))
    assert decision.model.key == "kling-o1"
    assert "ratio" in decision.rejected["lucy-2.6"]


def test_router_prefers_strength_for_relight():
    decision = choose_model(_request(intent="relight", quality="pro"), status=_all_ready)
    assert decision.model.key == "luma-ray-3.2"


def test_unknown_price_is_estimated_pessimistically():
    assert pessimistic_price("standard") >= 0.126
    decision = choose_model(_request(), status=_only("ltx-2.3-retake", "lucy-2.6"))
    assert decision.model.key == "lucy-2.6"


def test_router_lists_rejections_when_nothing_available():
    with pytest.raises(NoModelAvailable) as error:
        choose_model(_request(), status=lambda model: "clé absente")
    assert error.value.rejected["kling-o1"] == "clé absente"


def test_router_unknown_preferred_model():
    with pytest.raises(NoModelAvailable):
        choose_model(_request(preferred_model="inconnu"), status=_all_ready)


# --- Plan de montage ---


def _edit(text, start=None, end=None, intent="add"):
    return EditRequest(text, intent, timecodes.TimeWindow(start=start, end=end))


def _router(key="kling-o1", quality="standard"):
    def route(request):
        return choose_model(
            RouteRequest(**{**request.__dict__, "preferred_model": key, "quality": quality}),
            status=_all_ready,
        )

    return route


def test_plan_splits_overlapping_timed_edits():
    plan = build_plan(
        [_edit("chevalier", start=2), _edit("dragon", start=15)], 20.0, router=_router("lucy-2.6")
    )
    layout = [(s.start, s.end, s.action, s.edit_indexes) for s in plan.segments]
    assert layout == [
        (0.0, 2.0, "keep", []),
        (2.0, 15.0, "edit", [0]),
        (15.0, 20.0, "edit", [0, 1]),
    ]
    assert plan.generations == 3
    assert any("jusqu'à la fin" in note for note in plan.assumptions)


def test_plan_chunks_long_segments_for_short_models():
    plan = build_plan([_edit("chevalier", start=0, end=25)], 25.0, router=_router("kling-o1"))
    pieces = plan.segments[0].pieces
    assert len(pieces) == 3  # 25 s avec un maximum de 10 s
    assert all(piece.end - piece.start <= 10 for piece in pieces)
    assert pieces[1].continuity_from_previous
    assert plan.warnings


def test_plan_renders_short_windows_with_context():
    plan = build_plan([_edit("logo", start=5, end=6)], 20.0, router=_router("kling-o1"))
    piece = plan.segments[1].pieces[0]
    assert (piece.start, piece.end) == (5.0, 6.0)
    assert piece.render_end - piece.render_start == pytest.approx(3.0)
    assert piece.render_start <= 5.0 and piece.render_end >= 6.0


def test_plan_context_near_the_end_shifts_backwards():
    plan = build_plan([_edit("logo", start=19.5, end=20)], 20.0, router=_router("kling-o1"))
    piece = plan.segments[-1].pieces[0]
    assert piece.render_end == pytest.approx(20.0)
    assert piece.render_start == pytest.approx(17.0)


def test_plan_cost_estimate():
    plan = build_plan([_edit("x", start=0, end=10)], 10.0, router=_router("lucy-2.6"))
    assert plan.estimated_cost({("lucy-2.6", "standard"): 0.04}) == pytest.approx(0.4)
    assert plan.estimated_cost({}) is None
