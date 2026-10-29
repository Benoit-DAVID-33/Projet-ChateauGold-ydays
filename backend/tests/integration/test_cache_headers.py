"""Tests d'integration des en-tetes de cache HTTP (routes + middleware reels)."""


def test_html_page_has_etag_and_304(client):
    response = client.get("/login")
    assert "ETag" in response.headers
    etag = response.headers["ETag"]
    again = client.get("/login", headers={"If-None-Match": etag})
    assert again.status_code == 304


def test_static_cache_control(client):
    response = client.get("/static/css/style.css")
    assert "immutable" in response.headers.get("cache-control", "")


def test_static_css_is_gzipped(client):
    response = client.get("/static/css/style.css", headers={"Accept-Encoding": "gzip"})
    assert response.headers.get("content-encoding") == "gzip"


def test_media_cache_control(auth_client, media_folders):
    _, image = media_folders
    (image / "a.png").write_bytes(b"x")
    response = auth_client.get("/images/a.png")
    assert "max-age" in response.headers.get("cache-control", "")


def test_gzip_on_html(client):
    response = client.get("/login", headers={"Accept-Encoding": "gzip"})
    assert response.headers.get("content-encoding") == "gzip"


def test_no_gzip_on_media(auth_client, media_folders):
    video, _ = media_folders
    (video / "a.mp4").write_bytes(b"x" * 1000)
    response = auth_client.get("/videos/a.mp4", headers={"Accept-Encoding": "gzip"})
    assert response.headers.get("content-encoding") is None
