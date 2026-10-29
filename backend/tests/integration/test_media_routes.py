"""Tests des routes medias : upload, service, suppression, proxy API externe."""

from helpers import FakeClient, FakeResponse

from server import api_client, media_tools


def test_upload_image(auth_client, media_folders):
    _, image = media_folders
    response = auth_client.post(
        "/upload",
        files={"file": ("photo.png", b"PNGDATA", "image/png")},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"].startswith("/image?image=photo.png")
    assert (image / "photo.png").read_bytes() == b"PNGDATA"


def test_upload_video(auth_client, media_folders):
    video, _ = media_folders
    response = auth_client.post(
        "/upload",
        files={"file": ("clip.mp4", b"MP4DATA", "video/mp4")},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"].startswith("/video?video=clip.mp4")
    assert (video / "clip.mp4").read_bytes() == b"MP4DATA"


def test_upload_rejects_bad_type(auth_client, media_folders):
    response = auth_client.post(
        "/upload",
        files={"file": ("notes.txt", b"data", "text/plain")},
        follow_redirects=False,
    )
    assert response.status_code == 303


def test_serve_image(auth_client, media_folders):
    _, image = media_folders
    (image / "a.png").write_bytes(b"x")
    response = auth_client.get("/images/a.png")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")


def test_serve_video(auth_client, media_folders):
    video, _ = media_folders
    (video / "a.mp4").write_bytes(b"x")
    assert auth_client.get("/videos/a.mp4").status_code == 200


def test_serve_missing_file(auth_client, media_folders):
    assert auth_client.get("/images/absent.png").status_code == 404


def test_serve_blocks_traversal(auth_client, media_folders):
    assert auth_client.get("/images/..%2F..%2Fconfig.py").status_code in (400, 404)


def test_delete_file(auth_client, media_folders):
    _, image = media_folders
    (image / "d.png").write_bytes(b"x")
    assert auth_client.post("/delete/d.png").json() == {"status": "deleted"}
    assert not (image / "d.png").exists()


def test_delete_missing_file(auth_client, media_folders):
    assert auth_client.post("/delete/absent.png").status_code == 404


def test_send_to_api_image(auth_client, media_folders, monkeypatch):
    _, image = media_folders
    (image / "s.png").write_bytes(b"x")
    fake = FakeClient(FakeResponse(200, content=b"PROCESSED"))
    monkeypatch.setattr(api_client, "get_api_client", lambda: fake)
    response = auth_client.post("/send-to-api/s.png", json={"query": "salut"})
    assert response.status_code == 200
    assert response.json()["processed_image"] == "processed_s.png"
    assert (image / "processed_s.png").read_bytes() == b"PROCESSED"


def test_send_to_api_bad_type(auth_client):
    assert auth_client.post("/send-to-api/notes.txt").status_code == 400


def test_send_to_api_missing_file(auth_client, media_folders):
    assert auth_client.post("/send-to-api/absent.png").status_code == 404


def test_send_to_api_external_down(auth_client, media_folders, monkeypatch):
    import httpx

    from server import config

    _, image = media_folders
    (image / "s.png").write_bytes(b"x")

    class Boom:
        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("down")

    monkeypatch.setattr(api_client, "get_api_client", lambda: Boom())
    assert auth_client.post("/send-to-api/s.png").status_code == 503
    assert config.IMAGE_FOLDER == image


def test_send_query_to_api(auth_client, monkeypatch):
    fake = FakeClient(FakeResponse(200, json_data={"status": "success", "response": "ok"}))
    monkeypatch.setattr(api_client, "get_api_client", lambda: fake)
    response = auth_client.post("/send-query-to-api", json={"query": "bonjour"})
    assert response.status_code == 200
    assert response.json()["response"] == "ok"


def test_send_query_to_api_empty(auth_client):
    assert auth_client.post("/send-query-to-api", json={"query": ""}).status_code == 400


def test_process_query_with_file(auth_client, monkeypatch):
    fake = FakeClient(FakeResponse(200, content=b"OK"))
    monkeypatch.setattr(api_client, "get_api_client", lambda: fake)
    response = auth_client.post(
        "/process-query",
        files={"file": ("x.png", b"d", "image/png")},
        data={"prompt": "hello"},
    )
    assert response.status_code == 200
    assert fake.calls[0][1] == "/process-video"


def test_process_query_text_only(auth_client, monkeypatch):
    fake = FakeClient(FakeResponse(200, json_data={"ok": True}))
    monkeypatch.setattr(api_client, "get_api_client", lambda: fake)
    response = auth_client.post("/process-query", data={"prompt": "hello"})
    assert response.status_code == 200
    assert fake.calls[0][1] == "/process-query"


def test_convert_webm_to_mp4(auth_client, monkeypatch):
    def fake_convert(path_in, path_out):
        with open(path_out, "wb") as handle:
            handle.write(b"MP4DATA")

    monkeypatch.setattr(media_tools, "ffmpeg_webm_to_mp4", fake_convert)
    response = auth_client.post(
        "/api/convert-webm-to-mp4",
        files={"file": ("record.webm", b"WEBM", "video/webm")},
    )
    assert response.status_code == 200
    assert response.content == b"MP4DATA"


def test_convert_webm_to_mp4_failure(auth_client, monkeypatch):
    def boom(path_in, path_out):
        raise OSError("ffmpeg introuvable")

    monkeypatch.setattr(media_tools, "ffmpeg_webm_to_mp4", boom)
    response = auth_client.post(
        "/api/convert-webm-to-mp4",
        files={"file": ("record.webm", b"WEBM", "video/webm")},
    )
    assert response.status_code == 500
