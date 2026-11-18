from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from goldfx import cli
from goldfx.config import Settings

from ..conftest import Api
from ..fakes import FakeGenerationProvider, FrozenClock, png_bytes


def test_text_to_image_lifecycle(api: Api, provider: FakeGenerationProvider) -> None:
    api.signup()
    r = api.post(
        "/api/generations",
        json={"kind": "text_to_image", "prompt": "château doré au coucher du soleil", "count": 1},
    )
    assert r.status_code == 201, r.text
    gen = r.json()
    assert gen["status"] == "submitted"

    assert api.get(f"/api/generations/{gen['id']}").json()["status"] == "processing"
    done = api.get(f"/api/generations/{gen['id']}").json()
    assert done["status"] == "succeeded" and len(done["result_media_ids"]) == 1

    result = api.get(f"/api/media/{done['result_media_ids'][0]}").json()
    assert result["source"] == "generated" and result["kind"] == "image"
    assert [g["id"] for g in api.get("/api/generations").json()] == [gen["id"]]


def test_omni_video_uses_signed_public_url(api: Api, provider: FakeGenerationProvider) -> None:
    api.signup()
    video = api.upload(b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64, "src.mp4").json()
    r = api.post(
        "/api/generations",
        json={
            "kind": "omni_video",
            "prompt": "transforme en film noir",
            "mode": "pro",
            "source_media_id": video["id"],
        },
    )
    assert r.status_code == 201, r.text
    url = provider.submitted[-1].video_url
    assert url is not None and url.startswith("https://goldfx.test/api/public/media/")
    # Le lien signé est bien consommable sans session
    token = url.rsplit("/", 1)[1]
    assert api.client.get(f"/api/public/media/{token}").status_code == 200


def test_generation_validation_and_isolation(make_api: Callable[[], Api]) -> None:
    alice, bob = make_api(), make_api()
    alice.signup("alice")
    bob.signup("bob")
    bad = alice.post("/api/generations", json={"kind": "text_to_image", "prompt": ""})
    assert bad.status_code == 422
    unknown_kind = alice.post("/api/generations", json={"kind": "magic", "prompt": "x"})
    assert unknown_kind.status_code == 422
    gen = alice.post("/api/generations", json={"kind": "text_to_video", "prompt": "x"}).json()
    assert bob.get(f"/api/generations/{gen['id']}").status_code == 404
    image = alice.upload(png_bytes()).json()
    stolen = bob.post(
        "/api/generations", json={"kind": "image_to_video", "source_media_id": image["id"]}
    )
    assert stolen.status_code == 404


def test_provider_health(api: Api) -> None:
    api.signup()
    assert api.get("/api/generations/provider/health").json() == {"ok": True, "message": "ok"}


def test_import_legacy_users_json(
    api: Api, tmp_path: Path, settings: Settings, monkeypatch: object
) -> None:
    from werkzeug.security import generate_password_hash

    legacy = {
        "Ricardo": {"email": "ricardo@ex.com", "password": generate_password_hash("ancien-mdp")},
        "incomplet": {"email": ""},
    }
    path = tmp_path / "users.json"
    path.write_text(json.dumps(legacy), encoding="utf-8")
    monkeypatch.setattr(cli, "get_settings", lambda: settings)  # type: ignore[attr-defined]
    assert cli.main(["import-users", str(path)]) == 0
    assert cli.main(["import-users", str(path)]) == 0  # idempotent

    r = api.post("/api/auth/login", json={"identifier": "ricardo", "password": "ancien-mdp"})
    assert r.status_code == 200 and r.json()["username"] == "Ricardo"


def test_generation_list_filters_by_source_and_paginates(
    api: Api, provider: FakeGenerationProvider, clock: FrozenClock
) -> None:
    api.signup()
    image = api.upload(png_bytes(), "src.png").json()
    ids = []
    for prompt in ("a", "b"):
        clock.advance(seconds=1)
        r = api.post("/api/generations", json={"kind": "text_to_image", "prompt": prompt})
        ids.append(r.json()["id"])
    clock.advance(seconds=1)
    animated = api.post(
        "/api/generations", json={"kind": "image_to_video", "source_media_id": image["id"]}
    ).json()["id"]

    assert [g["id"] for g in api.get("/api/generations?limit=2").json()] == [animated, ids[1]]
    assert [g["id"] for g in api.get("/api/generations?limit=2&offset=2").json()] == [ids[0]]
    from_image = api.get(f"/api/generations?source_media_id={image['id']}").json()
    assert [g["id"] for g in from_image] == [animated]
