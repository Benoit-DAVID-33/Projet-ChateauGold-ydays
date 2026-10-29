"""Tests de la facade utilisateurs (hachage, authentification, cache)."""

from server import security


def test_create_and_authenticate():
    ok, message = security.create_user("alice", "alice@example.com", "secret")
    assert ok
    assert "succès" in message
    assert security.authenticate("alice", "secret") is True
    assert security.authenticate("alice", "wrong") is False
    assert security.authenticate("bob", "secret") is False
    assert security.get_email("alice") == "alice@example.com"


def test_create_user_duplicate_username():
    security.create_user("alice", "alice@example.com", "secret")
    ok, message = security.create_user("alice", "other@example.com", "secret")
    assert ok is False
    assert "utilisateur" in message


def test_create_user_duplicate_email():
    security.create_user("alice", "shared@example.com", "secret")
    ok, message = security.create_user("bob", "shared@example.com", "secret")
    assert ok is False
    assert "email" in message


def test_authenticate_empty_credentials():
    assert security.authenticate("", "") is False


def test_get_email_unknown_user():
    assert security.get_email("inconnu") == ""


def test_get_email_is_cached(monkeypatch):
    security.create_user("carol", "carol@example.com", "pw")
    store = security._store
    calls = {"count": 0}
    original = store.get

    def counting(username):
        calls["count"] += 1
        return original(username)

    monkeypatch.setattr(store, "get", counting)
    assert security.get_email("carol") == "carol@example.com"
    assert security.get_email("carol") == "carol@example.com"
    assert calls["count"] == 1
