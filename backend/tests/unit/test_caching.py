"""Tests unitaires du cache memoire et du middleware de compression.

Ces tests sont isoles : ils n'exercent ni le reseau ni le routeur HTTP.
"""

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

    scope = {"type": "http", "path": path, "headers": [(b"accept-encoding", b"gzip")]}
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
