"""Tests des adaptateurs d'edition video (fal.ai, Decart, Luma, Kling) sans reseau."""

import asyncio
import json

import pytest
from helpers import FakeClient, FakeResponse

from server import config
from server.integrations import kling_api
from server.video_editing.catalog import get_model
from server.video_editing.providers import (
    EditJobInput,
    EditProviderError,
    decart,
    fal,
    get_provider,
    luma,
)
from server.video_editing.providers import base as provider_base


class _Lazy:
    """Remplace un ``LazyClient`` : renvoie toujours le meme faux client."""

    def __init__(self, client):
        self.client = client

    def get(self):
        return self.client


def _job(tmp_path, model_key, quality="standard", **kwargs):
    video = tmp_path / "piece.mp4"
    video.write_bytes(b"\x00\x00\x00 ftypmp42 fake")
    model = get_model(model_key)
    return EditJobInput(
        model=model, tier=model.tier(quality), video_path=video, prompt="Add a knight", **kwargs
    )


@pytest.fixture(autouse=True)
def fast_polling(monkeypatch):
    monkeypatch.setattr(config, "VIDEO_POLL_INTERVAL_SECONDS", 0.0)

    async def no_sleep(_):
        return None

    monkeypatch.setattr(provider_base.asyncio, "sleep", no_sleep)


def test_get_provider_unknown():
    with pytest.raises(EditProviderError):
        get_provider("inconnu")


def test_fal_kling_edit_uses_quality_endpoint_and_data_uri(tmp_path, monkeypatch):
    fake = FakeClient(
        FakeResponse(
            200, json_data={"status_url": "https://q/status", "response_url": "https://q/result"}
        )
    )
    monkeypatch.setattr(fal, "_client", _Lazy(fake))
    monkeypatch.setattr(config, "FAL_API_KEY", "fal-key")
    monkeypatch.setattr(config, "PUBLIC_BASE_URL", "")
    job = _job(tmp_path, "kling-o3-edit", "pro")
    remote = asyncio.run(get_provider("fal").submit(job))
    method, url, kwargs = fake.calls[0]
    assert method == "POST"
    assert url.endswith("fal-ai/kling-video/o3/pro/video-to-video/edit")
    assert kwargs["headers"]["Authorization"] == "Key fal-key"
    assert kwargs["json"]["video_url"].startswith("data:video/mp4;base64,")
    assert kwargs["json"]["keep_audio"] is False
    assert json.loads(remote) == {"status": "https://q/status", "result": "https://q/result"}


def test_fal_retake_sends_time_window(tmp_path):
    job = _job(tmp_path, "ltx-2.3-retake", options={"start_time": 1.5, "duration": 4})
    body = fal.build_input(job)
    assert body["start_time"] == 1.5
    assert body["duration"] == 4.0
    assert body["retake_mode"] == "replace_video"


def test_fal_poll_states(tmp_path, monkeypatch):
    fake = FakeClient(
        [
            FakeResponse(200, json_data={"status": "IN_PROGRESS"}),
            FakeResponse(200, json_data={"status": "COMPLETED"}),
            FakeResponse(200, json_data={"video": {"url": "https://cdn/out.mp4"}}),
        ]
    )
    monkeypatch.setattr(fal, "_client", _Lazy(fake))
    remote = json.dumps({"status": "https://q/s", "result": "https://q/r"})
    provider = get_provider("fal")
    job = _job(tmp_path, "kling-o3-edit")
    assert asyncio.run(provider.poll(remote, job)).state == "pending"
    done = asyncio.run(provider.poll(remote, job))
    assert (done.state, done.video_url) == ("done", "https://cdn/out.mp4")


def test_fal_errors_are_readable(tmp_path, monkeypatch):
    monkeypatch.setattr(fal, "_client", _Lazy(FakeClient(FakeResponse(402, json_data={}))))
    with pytest.raises(EditProviderError, match="Crédits"):
        asyncio.run(get_provider("fal").submit(_job(tmp_path, "kling-o3-edit")))


def test_decart_multipart_submit_and_poll(tmp_path, monkeypatch):
    fake = FakeClient(
        [
            FakeResponse(200, json_data={"job_id": "j1"}),
            FakeResponse(200, json_data={"status": "completed"}),
        ]
    )
    monkeypatch.setattr(decart, "_client", _Lazy(fake))
    monkeypatch.setattr(config, "DECART_API_KEY", "dk")
    provider = get_provider("decart")
    job = _job(tmp_path, "lucy-2.6")
    assert asyncio.run(provider.submit(job)) == "j1"
    _, url, kwargs = fake.calls[0]
    assert url.endswith("/v1/jobs/lucy-2.6")
    assert kwargs["headers"] == {"X-API-KEY": "dk"}
    assert "data" in kwargs["files"]
    assert kwargs["data"]["resolution"] == "720p"
    result = asyncio.run(provider.poll("j1", job))
    assert result.video_url.endswith("/v1/jobs/j1/content")


def test_luma_body_uses_strength_and_resolution(tmp_path):
    job = _job(tmp_path, "luma-ray-3.2", "pro", options={"strength": "flex"})
    body = luma.build_body(job)
    assert body["type"] == "video_edit"
    assert body["video"]["resolution"] == "1080p"
    assert body["video"]["edit"]["strength"] == "flex_2"
    assert body["source"]["media_type"] == "video/mp4"


def test_luma_public_url_preferred(tmp_path):
    job = _job(tmp_path, "luma-ray-3.2", public_url="https://public/piece.mp4")
    assert luma.build_body(job)["source"] == {
        "url": "https://public/piece.mp4",
        "media_type": "video/mp4",
    }


def test_kling_provider_requires_public_url(tmp_path):
    with pytest.raises(EditProviderError, match="URL publique"):
        asyncio.run(get_provider("kling").submit(_job(tmp_path, "kling-o1")))


def test_run_edit_full_cycle_counts_submission(tmp_path, monkeypatch):
    calls = {"omni": None}

    async def fake_omni(**kwargs):
        calls["omni"] = kwargs
        return {"code": 0, "data": {"task_id": "t1"}}

    async def fake_task(task_id):
        return {
            "data": {
                "task_status": "succeed",
                "task_result": {"videos": [{"url": "https://cdn/v.mp4"}]},
            }
        }

    async def fake_download(self, url, destination):
        destination.write_bytes(b"video")
        return destination

    monkeypatch.setattr(kling_api, "omni_video", fake_omni)
    monkeypatch.setattr(kling_api, "get_omni_video_task", fake_task)
    monkeypatch.setattr(provider_base.EditProvider, "download", fake_download)
    submitted = []
    job = _job(tmp_path, "kling-o1", "pro", public_url="https://public/p.mp4")
    output = asyncio.run(
        get_provider("kling").run_edit(job, tmp_path / "out.mp4", lambda: submitted.append(1))
    )
    assert output.read_bytes() == b"video"
    assert submitted == [1]
    assert calls["omni"]["mode"] == "pro"
    assert calls["omni"]["video_url"] == "https://public/p.mp4"


def test_run_edit_reports_failure(tmp_path, monkeypatch):
    async def fake_omni(**kwargs):
        return {"code": 0, "data": {"task_id": "t1"}}

    async def fake_task(task_id):
        return {"data": {"task_status": "failed", "task_status_msg": "contenu refusé"}}

    monkeypatch.setattr(kling_api, "omni_video", fake_omni)
    monkeypatch.setattr(kling_api, "get_omni_video_task", fake_task)
    job = _job(tmp_path, "kling-o1", public_url="https://public/p.mp4")
    with pytest.raises(EditProviderError, match="contenu refusé"):
        asyncio.run(get_provider("kling").run_edit(job, tmp_path / "out.mp4"))
