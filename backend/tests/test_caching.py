"""Tests du cache memoire, de la compression gzip et des en-tetes de cache."""

import asyncio
import time

from server.caching import SelectiveGZipMiddleware, TTLCache


def _run_middleware(content_type: str, body: bytes, path: str = "/page"):
    """Execute SelectiveGZipMiddleware sur un faux app ASGI et retourne les messages."""
    messages: list[dict] = []

    async def app(_scope, _receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", content_type.encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "path": path,
        "headers": [(b"accept-encoding", b"gzip")],
    }
    asyncio.run(SelectiveGZipMiddleware(app)(scope, None, send))
    return messages


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


def test_gzip_middleware_compresses_text():
    payload = b"a" * 2000
    messages = _run_middleware("text/css", payload)
    headers = dict(messages[0]["headers"])
    assert headers[b"content-encoding"] == b"gzip"
    assert len(messages[1]["body"]) < len(payload)


def test_gzip_middleware_skips_media():
    payload = b"a" * 2000
    messages = _run_middleware("video/mp4", payload, path="/videos/a.mp4")
    headers = dict(messages[0]["headers"])
    assert b"content-encoding" not in headers
    assert messages[1]["body"] == payload


def test_gzip_middleware_small_body_not_compressed():
    messages = _run_middleware("text/html", b"court")
    headers = dict(messages[0]["headers"])
    assert b"content-encoding" not in headers
    assert messages[1]["body"] == b"court"


def test_gzip_middleware_forwards_pathsend():
    """Un envoi direct de fichier (pathsend) ne doit pas etre bloque (regression granian)."""
    messages: list[dict] = []

    async def app(_scope, _receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"text/css")],
            }
        )
        await send({"type": "http.response.pathsend", "path": "style.css"})

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "path": "/static/css/style.css",
        "headers": [(b"accept-encoding", b"gzip")],
    }
    asyncio.run(SelectiveGZipMiddleware(app)(scope, None, send))

    assert [message["type"] for message in messages] == [
        "http.response.start",
        "http.response.body",
        "http.response.pathsend",
    ]


def test_html_page_has_etag_and_304(client):
    response = client.get("/login")
    assert "ETag" in response.headers
    etag = response.headers["ETag"]
    again = client.get("/login", headers={"If-None-Match": etag})
    assert again.status_code == 304


def test_static_cache_control(client):
    response = client.get("/static/css/style.css")
    assert "immutable" in response.headers.get("cache-control", "")


def test_static_content_intact(client):
    response = client.get("/static/css/style.css")
    assert response.status_code == 200
    assert len(response.content) > 1000


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
