from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from ..conftest import Api


def test_full_auth_flow(api: Api) -> None:
    user = api.signup("alice")
    assert user["username"] == "alice"
    me = api.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == "alice@example.com"

    assert api.post("/api/auth/logout").status_code == 204
    assert api.get("/api/auth/me").status_code == 401


def test_session_cookie_is_hardened(api: Api) -> None:
    api.post(
        "/api/auth/register",
        json={"username": "bob", "email": "bob@ex.com", "password": "motdepasse"},
    )
    r = api.post("/api/auth/login", json={"identifier": "bob@ex.com", "password": "motdepasse"})
    cookie = next(h for h in r.headers.get_list("set-cookie") if h.startswith("goldfx_session="))
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie


def test_writes_require_csrf_token(client: TestClient) -> None:
    r = client.post(
        "/api/auth/register",
        json={"username": "eve", "email": "eve@ex.com", "password": "motdepasse"},
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    client.get("/api/auth/csrf")
    r = client.post(
        "/api/auth/register",
        headers={"X-CSRF-Token": "mauvais"},
        json={"username": "eve", "email": "eve@ex.com", "password": "motdepasse"},
    )
    assert r.status_code == 403


def test_login_errors_do_not_leak_which_field_is_wrong(api: Api) -> None:
    api.signup("carol")
    api.post("/api/auth/logout")
    wrong_pw = api.post("/api/auth/login", json={"identifier": "carol", "password": "nope"})
    unknown = api.post("/api/auth/login", json={"identifier": "nobody", "password": "nope"})
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


def test_login_is_case_insensitive_and_accepts_email(api: Api) -> None:
    api.signup("Dave")
    api.post("/api/auth/logout")
    for identifier in ("dave", "DAVE@example.com"):
        r = api.post(
            "/api/auth/login", json={"identifier": identifier, "password": "motdepasse-solide"}
        )
        assert r.status_code == 200


def test_register_validation_and_conflicts(api: Api) -> None:
    api.signup("erin")
    dup = api.post(
        "/api/auth/register",
        json={"username": "ERIN", "email": "x@ex.com", "password": "motdepasse"},
    )
    assert dup.status_code == 409
    bad_email = api.post(
        "/api/auth/register", json={"username": "frank", "email": "nope", "password": "x" * 9}
    )
    assert bad_email.status_code == 422
    short = api.post(
        "/api/auth/register", json={"username": "frank", "email": "f@ex.com", "password": "123"}
    )
    assert short.status_code == 422 and "8 caractères" in short.json()["error"]["message"]


def test_brute_force_is_throttled(api: Api) -> None:
    api.signup("gina")
    codes = [
        api.post("/api/auth/login", json={"identifier": "gina", "password": "x"}).status_code
        for _ in range(6)
    ]
    assert codes[-1] == 429


def test_protected_routes_require_login(client: TestClient) -> None:
    for url in ("/api/auth/me", "/api/media", "/api/generations"):
        assert client.get(url).status_code == 401


def test_sessions_are_isolated(make_api: Callable[[], Api]) -> None:
    a, b = make_api(), make_api()
    a.signup("henri")
    assert b.get("/api/auth/me").status_code == 401


def test_health_and_security_headers(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "x-request-id" in r.headers
    assert client.get("/api/health/ready").status_code == 200
