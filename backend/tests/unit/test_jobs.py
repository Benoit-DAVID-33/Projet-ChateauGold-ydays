"""Tests de la file de travaux : persistance, priorite, annulation, remboursement."""

import asyncio
import json

from server import config
from server.accounts import usage
from server.video_editing.jobs import Job, JobQueue, JobStore, new_job_id


def _job(**kwargs):
    defaults = {
        "id": new_job_id(),
        "username": "alice",
        "source_filename": "v.mp4",
        "request": {},
        "plan": {"segments": []},
        "generations": 2,
        "estimated_cost_usd": 0.5,
        "priority": 10,
        "usage_day": usage.utc_day(),
    }
    return Job(**{**defaults, **kwargs})


def test_store_persists_and_lists(tmp_path):
    store = JobStore(tmp_path)
    first, second = _job(), _job(username="bob")
    store.save(first)
    store.save(second)
    reloaded = JobStore(tmp_path)
    assert reloaded.get(first.id).username == "alice"
    assert [job.id for job in reloaded.list_for("alice")] == [first.id]
    assert len(reloaded.all()) == 2


def test_public_view_hides_file_token():
    data = _job().public()
    assert "file_token" not in data
    assert "cancel_requested" not in data


def test_interrupted_job_is_failed_and_refunded(tmp_path, isolated_video_editing, monkeypatch):
    monkeypatch.setattr(config, "PLAN_FREE_DAILY_GENERATIONS", 5)
    isolated_video_editing.reserve("alice", 2)
    job = _job(status="running", paid_calls_done=1)
    (tmp_path / f"{job.id}.json").write_text(json.dumps(job.__dict__), encoding="utf-8")
    store = JobStore(tmp_path)
    restored = store.get(job.id)
    assert restored.status == "failed"
    assert "redémarrage" in restored.error
    # 2 reservees, 1 envoyee au fournisseur : 1 rendue
    assert isolated_video_editing.snapshot("alice").used == 1


def test_unreadable_job_file_is_ignored(tmp_path):
    (tmp_path / "broken.json").write_text("{pas du json", encoding="utf-8")
    assert JobStore(tmp_path).all() == []


def test_queue_runs_by_priority_and_marks_done(tmp_path):
    store = JobStore(tmp_path)
    order = []

    async def runner(job, _store):
        order.append(job.username)
        job.status = "done"

    async def scenario():
        queue = JobQueue(store, runner, workers=1)
        free, studio = _job(username="free", priority=10), _job(username="studio", priority=0)
        for job in (free, studio):
            store.save(job)
        # les deux sont en file avant que le travailleur ne demarre
        await queue.submit(free)
        await queue.submit(studio)
        await asyncio.sleep(0.05)
        await queue.aclose()
        return free, studio

    free, studio = asyncio.run(scenario())
    assert store.get(studio.id).status == "done"
    assert order == ["studio", "free"]
    assert store.get(free.id).status == "done"


def test_queue_failure_refunds_unsent_generations(tmp_path, isolated_video_editing, monkeypatch):
    monkeypatch.setattr(config, "PLAN_FREE_DAILY_GENERATIONS", 5)
    isolated_video_editing.reserve("alice", 2)
    store = JobStore(tmp_path)

    async def runner(job, _store):
        raise RuntimeError("panne fournisseur")

    async def scenario():
        queue = JobQueue(store, runner, workers=1)
        job = _job()
        store.save(job)
        await queue.submit(job)
        await asyncio.sleep(0.05)
        await queue.aclose()
        return job

    job = asyncio.run(scenario())
    stored = store.get(job.id)
    assert stored.status == "failed"
    assert "panne fournisseur" in stored.error
    assert isolated_video_editing.snapshot("alice").used == 0


def test_cancel_before_start(tmp_path):
    store = JobStore(tmp_path)

    async def runner(job, _store):
        raise AssertionError("ne doit pas tourner")

    async def scenario():
        queue = JobQueue(store, runner, workers=1)
        job = _job(cancel_requested=True)
        store.save(job)
        await queue.submit(job)
        await asyncio.sleep(0.05)
        await queue.aclose()
        return job

    job = asyncio.run(scenario())
    assert store.get(job.id).status == "cancelled"
