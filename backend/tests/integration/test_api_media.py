from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from goldfx.container import Container

from ..conftest import Api
from ..fakes import MP4_BYTES, SVG_BYTES, FrozenClock, png_bytes


def test_upload_list_get_content_delete(api: Api) -> None:
    api.signup()
    r = api.upload(png_bytes(), "../../Photo de vacances.png")
    assert r.status_code == 201, r.text
    media = r.json()
    assert media["kind"] == "image" and media["content_type"] == "image/png"
    assert media["name"] == "Photo de vacances.png"  # chemin retiré

    listing = api.get("/api/media").json()
    assert [m["id"] for m in listing] == [media["id"]]
    assert api.get("/api/media?kind=video").json() == []

    content = api.get(media["content_url"])
    assert content.status_code == 200 and content.content == png_bytes()
    assert "sandbox" in content.headers["content-security-policy"]
    download = api.get(media["content_url"] + "?download=true")
    assert download.headers["content-disposition"].startswith("attachment")

    assert api.delete(f"/api/media/{media['id']}").status_code == 204
    assert api.get(f"/api/media/{media['id']}").status_code == 404


def test_video_supports_range_requests(api: Api) -> None:
    api.signup()
    media = api.upload(MP4_BYTES, "clip.mp4").json()
    assert media["kind"] == "video"
    r = api.get(media["content_url"], headers={"Range": "bytes=0-9"})
    assert r.status_code == 206 and r.content == MP4_BYTES[:10]


def test_rejects_svg_and_fake_extensions(api: Api) -> None:
    api.signup()
    svg = api.upload(SVG_BYTES, "image.svg")
    assert svg.status_code == 415
    disguised = api.upload(b"<html><script>alert(1)</script>", "photo.png")
    assert disguised.status_code == 415
    empty = api.upload(b"", "vide.png")
    assert empty.status_code == 422


def test_size_limits(api: Api) -> None:
    api.signup()
    too_big = png_bytes() + b"\x00" * (1024 * 1024 + 1)  # limite image de test : 1 Mo
    assert api.upload(too_big, "big.png").status_code == 413


def test_media_is_private_to_its_owner(make_api: Callable[[], Api]) -> None:
    alice, bob = make_api(), make_api()
    alice.signup("alice")
    bob.signup("bob")
    media = alice.upload(png_bytes()).json()
    assert bob.get(f"/api/media/{media['id']}").status_code == 404
    assert bob.get(media["content_url"]).status_code == 404
    assert bob.delete(f"/api/media/{media['id']}").status_code == 404
    assert bob.post(f"/api/media/{media['id']}/process", json={}).status_code == 404
    assert bob.get("/api/media").json() == []


def test_editor_export_is_linked_to_original(api: Api) -> None:
    api.signup()
    original = api.upload(png_bytes(), "base.png").json()
    export = api.upload(
        png_bytes(8, 8), "image_modifiee.png", as_export="true", parent_id=original["id"]
    ).json()
    assert export["source"] == "export" and export["parent_id"] == original["id"]
    # supprimer l'original détache l'export sans le supprimer
    api.delete(f"/api/media/{original['id']}")
    assert api.get(f"/api/media/{export['id']}").json()["parent_id"] is None


def test_process_media_and_search(api: Api) -> None:
    api.signup()
    media = api.upload(png_bytes(), "a.png").json()
    processed = api.post(f"/api/media/{media['id']}/process", json={"query": "plus doré"})
    assert processed.status_code == 201
    body = processed.json()
    assert body["source"] == "processed" and body["parent_id"] == media["id"]
    assert body["name"] == "processed_a.png"

    text = api.post("/api/search", json={"query": "ajoute des paillettes"}).json()
    assert "ajoute des paillettes" in text["response"] and text["processed_media"] is None

    with_media = api.post("/api/search", json={"query": "x", "media_id": media["id"]}).json()
    assert with_media["processed_media"]["parent_id"] == media["id"]

    empty = api.post("/api/search", json={"query": "   "})
    assert empty.status_code == 422


def test_public_signed_link(api: Api, container: Container, client: TestClient) -> None:
    api.signup()
    media = api.upload(MP4_BYTES, "v.mp4").json()
    token = container.signer.sign(media["id"], container.clock.now() + timedelta(minutes=5))
    anonymous = TestClient(client.app)
    assert anonymous.get(f"/api/public/media/{token}").content == MP4_BYTES
    assert anonymous.get(f"/api/public/media/{token}x").status_code == 401
    expired = container.signer.sign(media["id"], container.clock.now() - timedelta(seconds=1))
    assert anonymous.get(f"/api/public/media/{expired}").status_code == 401


def test_webm_to_mp4(api: Api, webm_file: Path) -> None:
    api.signup()
    data = webm_file.read_bytes()
    r = api.post("/api/transcode/webm-to-mp4", files={"file": ("rec.webm", data)})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "video/mp4" and r.content[4:8] == b"ftyp"
    assert "video_modifiee_annotations.mp4" in r.headers["content-disposition"]

    saved = api.post(
        "/api/transcode/webm-to-mp4",
        files={"file": ("rec.webm", data)},
        data={"save_to_library": "true"},
    )
    assert saved.status_code == 201 and saved.json()["source"] == "export"

    invalid = api.post("/api/transcode/webm-to-mp4", files={"file": ("x.webm", png_bytes())})
    assert invalid.status_code == 422


def test_contact(api: Api, container: Container) -> None:
    api.signup()
    r = api.post(
        "/api/contact", json={"name": "Alice", "email": "alice@ex.com", "message": "Bonjour !"}
    )
    assert r.status_code == 202
    assert container.mailer.sent[-1].reply_to == "alice@ex.com"  # type: ignore[attr-defined]
    assert (
        api.post("/api/contact", json={"name": "", "email": "x", "message": ""}).status_code == 422
    )


def test_list_pagination_and_parent_filter(api: Api, clock: FrozenClock) -> None:
    api.signup()
    originals = []
    for index in range(3):
        clock.advance(seconds=1)
        originals.append(api.upload(png_bytes(), f"img{index}.png").json()["id"])
    clock.advance(seconds=1)
    export = api.upload(png_bytes(), "annot.png", as_export="true", parent_id=originals[0]).json()[
        "id"
    ]

    page1 = [m["id"] for m in api.get("/api/media?limit=2").json()]
    page2 = [m["id"] for m in api.get("/api/media?limit=2&offset=2").json()]
    assert page1 == [export, originals[2]] and page2 == [originals[1], originals[0]]

    derived = api.get(f"/api/media?parent_id={originals[0]}").json()
    assert [m["id"] for m in derived] == [export]
    assert api.get(f"/api/media?parent_id={originals[1]}").json() == []
