from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..conftest import Api


def graph(nodes: int = 2) -> dict[str, Any]:
    ids = [f"n{i}" for i in range(nodes)]
    return {
        "version": 1,
        "nodes": [
            {"id": i, "type": "prompt", "position": {"x": 0, "y": 0}, "data": {}} for i in ids
        ],
        "edges": [{"id": "e0", "source": ids[0], "target": ids[1]}] if nodes > 1 else [],
    }


def test_crud(api: Api) -> None:
    api.signup()
    created = api.post("/api/workflows", json={"name": "  Omni   rapide ", "graph": graph()})
    assert created.status_code == 201, created.text
    wf = created.json()
    assert wf["name"] == "Omni rapide" and wf["graph"]["version"] == 1

    listing = api.get("/api/workflows").json()
    assert [w["id"] for w in listing] == [wf["id"]] and "graph" not in listing[0]

    updated = api.client.put(
        f"/api/workflows/{wf['id']}",
        json={"name": "Renommé", "graph": graph(3)},
        headers={"X-CSRF-Token": api.csrf},
    )
    assert updated.status_code == 200 and len(updated.json()["graph"]["nodes"]) == 3

    assert api.delete(f"/api/workflows/{wf['id']}").status_code == 204
    assert api.get(f"/api/workflows/{wf['id']}").status_code == 404


def test_put_requires_csrf(api: Api) -> None:
    api.signup()
    wf = api.post("/api/workflows", json={"name": "x", "graph": graph()}).json()
    r = api.client.put(f"/api/workflows/{wf['id']}", json={"name": "y", "graph": graph()})
    assert r.status_code == 403


def test_validation(api: Api) -> None:
    api.signup()
    cases = [
        {"name": "", "graph": graph()},
        {"name": "x", "graph": {"version": 99, "nodes": [], "edges": []}},
        {"name": "x", "graph": {"version": 1, "nodes": "nope", "edges": []}},
        {"name": "x", "graph": {"version": 1, "nodes": [{"id": "a"}], "edges": []}},
        {
            "name": "x",
            "graph": {
                "version": 1,
                "nodes": [{"id": "a", "type": "t"}],
                "edges": [{"source": "a", "target": "fantome"}],
            },
        },
        {"name": "x" * 121, "graph": graph()},
    ]
    for payload in cases:
        assert api.post("/api/workflows", json=payload).status_code == 422, payload
    huge = graph()
    huge["nodes"][0]["data"] = {"blob": "x" * (600 * 1024)}
    assert api.post("/api/workflows", json={"name": "x", "graph": huge}).status_code == 413


def test_workflows_are_private(make_api: Callable[[], Api]) -> None:
    alice, bob = make_api(), make_api()
    alice.signup("alice")
    bob.signup("bob")
    wf = alice.post("/api/workflows", json={"name": "secret", "graph": graph()}).json()
    assert bob.get(f"/api/workflows/{wf['id']}").status_code == 404
    assert bob.delete(f"/api/workflows/{wf['id']}").status_code == 404
    assert bob.get("/api/workflows").json() == []
