"""Tests des offres (limites reellement appliquees) et du suivi de consommation."""

import threading

import pytest

from server import config
from server.accounts import usage
from server.accounts.plans import all_plans, get_plan


def test_plans_expose_their_real_limits(monkeypatch):
    monkeypatch.setattr(config, "PLAN_FREE_DAILY_GENERATIONS", 3)
    free = get_plan("free")
    assert free.daily_generations == 3
    assert "3 génération(s) vidéo par jour" in free.features
    assert free.qualities == ("draft", "standard")
    assert get_plan("studio").allows_quality("4k")


def test_unknown_plan_falls_back_to_free():
    assert get_plan("platinum").key == "free"
    assert set(all_plans()) == {"free", "studio"}


def test_default_plan_is_free(isolated_video_editing):
    snapshot = isolated_video_editing.snapshot("alice")
    assert snapshot.plan.key == "free"
    assert snapshot.remaining == snapshot.plan.daily_generations


def test_reserve_and_refund(isolated_video_editing, monkeypatch):
    monkeypatch.setattr(config, "PLAN_FREE_DAILY_GENERATIONS", 2)
    store = isolated_video_editing
    assert store.reserve("bob", 2).remaining == 0
    with pytest.raises(usage.QuotaExceeded):
        store.reserve("bob", 1)
    store.refund("bob", 1, usage.utc_day())
    assert store.snapshot("bob").remaining == 1


def test_reservation_is_atomic_under_concurrency(isolated_video_editing, monkeypatch):
    monkeypatch.setattr(config, "PLAN_FREE_DAILY_GENERATIONS", 5)
    store = isolated_video_editing
    successes = []

    def attempt():
        try:
            store.reserve("carol", 1)
            successes.append(1)
        except usage.QuotaExceeded:
            pass

    threads = [threading.Thread(target=attempt) for _ in range(12)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(successes) == 5
    assert store.snapshot("carol").remaining == 0


def test_set_plan_and_upgrade_requests(isolated_video_editing):
    store = isolated_video_editing
    request_id = store.request_upgrade("dave", "studio", "court-métrage")
    assert [r["id"] for r in store.pending_upgrades()] == [request_id]
    assert store.set_plan("dave", "studio").key == "studio"
    assert store.plan_of("dave").key == "studio"
    store.close_upgrade(request_id, "granted")
    assert store.pending_upgrades() == []
