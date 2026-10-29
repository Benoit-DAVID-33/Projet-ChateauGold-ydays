"""Tests unitaires du plan de calques emoji (determinisme, bornes, disposition)."""

from server.emoji.layout import LayerOptions, make_rng, plan_layers, safe_name


def test_safe_name_is_filesystem_friendly():
    assert safe_name("Voiture") == "voiture"
    assert safe_name("Étoile filante") == "etoile-filante"
    assert safe_name("") == "emoji"


def test_rng_is_deterministic_with_seed():
    first = make_rng(7)
    second = make_rng(7)
    assert [first() for _ in range(5)] == [second() for _ in range(5)]


def test_rng_without_seed_still_returns_values():
    value = make_rng(None)()
    assert 0.0 <= value < 1.0


def test_plan_layers_defaults():
    plan = plan_layers([{"emoji": "🚗"}])
    assert plan["canvas"] == {"width": 960, "height": 540}
    assert plan["layers"][0]["quantity"] == 1


def test_plan_layers_counts_and_canvas():
    options = LayerOptions(width=800, height=450)
    plan = plan_layers([{"emoji": "🚗", "label_fr": "voiture", "quantity": 3}], options)
    assert plan["canvas"] == {"width": 800, "height": 450}
    layer = plan["layers"][0]
    assert layer["emoji"] == "🚗"
    assert layer["quantity"] == 3
    assert len(layer["positions"]) == 3
    assert layer["name"].endswith("-voiture.png")


def test_plan_layers_is_deterministic_with_seed():
    items = [{"emoji": "🚗", "quantity": 4}, {"emoji": "✈️", "quantity": 2}]
    first = plan_layers(items, LayerOptions(seed=42))
    second = plan_layers(items, LayerOptions(seed=42))
    assert first == second


def test_plan_layers_positions_stay_inside_canvas():
    options = LayerOptions(width=300, height=200, seed=1)
    plan = plan_layers([{"emoji": "🚗", "quantity": 20}], options)
    for position in plan["layers"][0]["positions"]:
        assert 0 <= position["x"] <= 300
        assert 0 <= position["y"] <= 200


def test_plan_layers_center_placement():
    options = LayerOptions(width=400, height=400, placement="center")
    positions = plan_layers([{"emoji": "🚗", "quantity": 4}], options)["layers"][0]["positions"]
    assert len(positions) == 4
    assert all("x" in position and "y" in position for position in positions)


def test_plan_layers_clamps_dimensions():
    options = LayerOptions(width=0, height=99999, size=99999)
    plan = plan_layers([{"emoji": "🚗"}], options)
    assert plan["canvas"]["width"] == 1
    assert plan["canvas"]["height"] == 8192
    assert plan["layers"][0]["size"] == 1200
