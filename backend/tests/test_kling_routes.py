"""Tests des routes proxy Kling (authentification et reponses)."""

from helpers import FakeClient, FakeResponse

from server import config, kling


def _fake(monkeypatch, response):
    fake = FakeClient(response)
    monkeypatch.setattr(kling, "get_client", lambda: fake)
    return fake


def test_kling_test_ok(auth_client, kling_keys, monkeypatch):
    _fake(monkeypatch, FakeResponse(200, json_data={"code": 0}))
    assert auth_client.get("/kling/test").status_code == 200


def test_kling_test_failure(auth_client, monkeypatch):
    monkeypatch.setattr(config, "KLING_ACCESS_KEY", "")
    monkeypatch.setattr(config, "KLING_SECRET_KEY", "")
    assert auth_client.get("/kling/test").status_code == 502


def test_generate_video_route(auth_client, kling_keys, monkeypatch):
    _fake(monkeypatch, FakeResponse(200, json_data={"data": {"task_id": "v1"}}))
    response = auth_client.post("/kling/generate-video", json={"prompt": "une vague"})
    assert response.status_code == 200
    assert response.json()["data"]["task_id"] == "v1"


def test_generate_image_route_requires_prompt(auth_client, kling_keys):
    assert auth_client.post("/kling/generate-image", json={}).status_code == 422


def test_image_status_route(auth_client, kling_keys, monkeypatch):
    _fake(monkeypatch, FakeResponse(200, json_data={"data": {"task_status": "processing"}}))
    assert auth_client.get("/kling/image-status/abc").status_code == 200


def test_omni_video_requires_public_base_url(auth_client, kling_keys):
    response = auth_client.post("/kling/omni-video", json={"prompt": "p", "filename": "v.mp4"})
    assert response.status_code == 400


def test_omni_video_ok(auth_client, kling_keys, monkeypatch):
    monkeypatch.setattr(config, "PUBLIC_BASE_URL", "https://example.test")
    fake = _fake(monkeypatch, FakeResponse(200, json_data={"data": {"task_id": "o1"}}))
    response = auth_client.post("/kling/omni-video", json={"prompt": "p", "filename": "v.mp4"})
    assert response.status_code == 200
    payload = fake.calls[0][2]["json"]
    assert payload["video_list"][0]["video_url"].endswith("/videos/v.mp4")


def test_omni_video_status_downloads(auth_client, kling_keys, monkeypatch, media_folders):
    video_folder, _ = media_folders
    _fake(
        monkeypatch,
        FakeResponse(
            200,
            json_data={
                "data": {
                    "task_status": "succeed",
                    "task_result": {"videos": [{"url": "http://cdn/v.mp4"}]},
                }
            },
        ),
    )
    response = auth_client.get("/kling/omni-video-status/task123")
    assert response.status_code == 200
    assert response.json()["local_video"] == "kling_task123.mp4"
    assert (video_folder / "kling_task123.mp4").exists()
