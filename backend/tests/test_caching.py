"""Tests du cache memoire, de la compression gzip et des en-tetes de cache."""

import time

from server.caching import TTLCache


def test_ttl_cache_set_get():
    cache = TTLCache(default_ttl=10)
    cache.set("a", 1)
    assert cache.get("a") == 1
    assert cache.get("absent") is None


def test_ttl_cache_expiry():
    cache = TTLCache(default_ttl=0)
    cache.set("a", 1)
    time.sleep(0.01)
    assert cache.get("a") is None


def test_ttl_cache_get_or_set():
    cache = TTLCache()
    calls = {"count": 0}

    def factory():
        calls["count"] += 1
        return "value"

    assert cache.get_or_set("k", factory) == "value"
    assert cache.get_or_set("k", factory) == "value"
    assert calls["count"] == 1


def test_ttl_cache_invalidate_and_clear():
    cache = TTLCache()
    cache.set("a", 1)
    cache.set("b", 2)
    cache.invalidate("a")
    assert cache.get("a") is None
    cache.clear()
    assert cache.get("b") is None


def test_ttl_cache_eviction():
    cache = TTLCache(default_ttl=100, max_size=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert len(cache._store) <= 2


def test_html_page_has_etag_and_304(client):
    response = client.get("/login")
    assert "ETag" in response.headers
    etag = response.headers["ETag"]
    again = client.get("/login", headers={"If-None-Match": etag})
    assert again.status_code == 304


def test_static_cache_control(client):
    response = client.get("/static/css/style.css")
    assert "immutable" in response.headers.get("cache-control", "")


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
