"""Tests du paquet db : repository SQLAlchemy, store JSON et import (seed)."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server import config, db, security
from server.db import JsonUserStore, SqlAlchemyUserStore, seed_from_json
from server.db.engine import Base


@pytest.fixture()
def sqlalchemy_store(tmp_path):
    """Store SQLAlchemy adosse a une base SQLite temporaire."""
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    return SqlAlchemyUserStore(sessionmaker(bind=engine))


def test_sqlalchemy_store_crud(sqlalchemy_store):
    assert sqlalchemy_store.get("alice") is None
    sqlalchemy_store.create("alice", "alice@example.com", "hash")
    record = sqlalchemy_store.get("alice")
    assert record.username == "alice"
    assert record.email == "alice@example.com"
    assert record.password_hash == "hash"
    assert sqlalchemy_store.exists_username("alice") is True
    assert sqlalchemy_store.exists_email("alice@example.com") is True
    assert sqlalchemy_store.exists_email("other@example.com") is False
    assert len(sqlalchemy_store.all()) == 1


def test_json_store_crud(tmp_path):
    store = JsonUserStore(tmp_path / "users.json")
    store.create("bob", "bob@example.com", "hash")
    assert store.get("bob").email == "bob@example.com"
    assert store.exists_username("bob") is True
    assert store.exists_email("bob@example.com") is True
    assert len(store.all()) == 1


def test_json_store_corrupt_file(tmp_path):
    path = tmp_path / "users.json"
    path.write_text("{ not json", encoding="utf-8")
    assert JsonUserStore(path).all() == []


def test_seed_from_json(tmp_path, sqlalchemy_store):
    path = tmp_path / "users.json"
    path.write_text(
        json.dumps({"demo": {"email": "demo@example.com", "password": "hash"}}),
        encoding="utf-8",
    )
    assert seed_from_json(path, sqlalchemy_store) == 1
    assert sqlalchemy_store.get("demo").email == "demo@example.com"
    assert seed_from_json(path, sqlalchemy_store) == 0


def test_seed_skips_invalid_entries(tmp_path, sqlalchemy_store):
    path = tmp_path / "users.json"
    path.write_text(json.dumps({"broken": "not-a-dict"}), encoding="utf-8")
    assert seed_from_json(path, sqlalchemy_store) == 0


def test_seed_missing_file(tmp_path, sqlalchemy_store):
    assert seed_from_json(tmp_path / "absent.json", sqlalchemy_store) == 0


def test_init_db_creates_and_seeds(tmp_path, monkeypatch):
    users = tmp_path / "users.json"
    users.write_text(json.dumps({"demo": {"email": "d@x.com", "password": "h"}}), encoding="utf-8")
    engine = create_engine(f"sqlite:///{(tmp_path / 'app.db').as_posix()}")
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(config, "USERS_FILE", users)
    monkeypatch.setattr(config, "USER_STORE", "sqlalchemy")
    db.init_db(target_engine=engine, session_factory=factory)
    assert SqlAlchemyUserStore(factory).get("demo") is not None


def test_facade_with_sqlalchemy_store(sqlalchemy_store, monkeypatch):
    monkeypatch.setattr(security, "_store", sqlalchemy_store)
    security.clear_cache()
    assert security.create_user("bob", "bob@example.com", "pw")[0] is True
    assert security.authenticate("bob", "pw") is True
