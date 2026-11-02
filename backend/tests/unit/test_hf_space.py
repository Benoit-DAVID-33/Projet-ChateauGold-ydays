"""Tests de la demonstration gratuite (Space Hugging Face JoyAI Video Edit)."""

import asyncio
import json
import shutil
import subprocess

import pytest
from helpers import FakeResponse

from server import config
from server.media import ffmpeg
from server.video_editing import catalog
from server.video_editing.providers import EditJobInput, EditProviderError, get_provider, hf_space
from server.video_editing.routing import (
    RouteRequest,
    choose_model,
    plan_status,
    provider_status,
)

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg absent")


@pytest.fixture(autouse=True)
def isolated_budget(tmp_path, monkeypatch):
    """Quota du Space isole (fichier temporaire, 110 s par jour)."""
    budget = hf_space.SpaceBudget(tmp_path / "budget.json", limit=110)
    monkeypatch.setattr(hf_space, "_budget", budget)
    monkeypatch.setattr(config, "HF_SPACE_ENABLED", True)
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", False)
    return budget


def test_space_url_and_gpu_estimate():
    assert space_url_of("hugging-apps/jdopensource-joyai-video-edit") == (
        "https://hugging-apps-jdopensource-joyai-video-edit.hf.space"
    )
    # Formule du Space : 15 + paquets x 2 pas x 1,1 (24 i/s, paquets de 8 images)
    assert hf_space.estimate_gpu_seconds(1.0) == pytest.approx(21.6)
    assert hf_space.estimate_gpu_seconds(4.0) == pytest.approx(41.4)


def space_url_of(space_id):
    return hf_space.space_url(space_id)


def test_budget_consumes_resets_and_exhausts(tmp_path, monkeypatch):
    budget = hf_space.SpaceBudget(tmp_path / "b.json", limit=100)
    budget.consume(40)
    assert budget.remaining() == pytest.approx(60)
    assert hf_space.SpaceBudget(tmp_path / "b.json", limit=100).remaining() == pytest.approx(60)
    budget.mark_exhausted()
    assert budget.remaining() == 0
    (tmp_path / "b.json").write_text(json.dumps({"day": "2000-01-01", "used": 100}))
    assert budget.remaining() == pytest.approx(100)  # nouveau jour


def test_catalog_entry_is_free_and_honest():
    model = catalog.get_model("joyai-edit-space")
    assert model.free and model.integrated
    assert model.max_seconds == 4.0
    assert model.tier("standard").price_usd_per_second == 0.0
    assert any("sans jeton" in note for note in model.notes)


def test_status_depends_on_switch_and_budget(isolated_budget, monkeypatch):
    model = catalog.get_model("joyai-edit-space")
    assert provider_status(model) is None
    isolated_budget.mark_exhausted()
    assert provider_status(model) == "quota gratuit du jour épuisé"
    monkeypatch.setattr(config, "HF_SPACE_ENABLED", False)
    assert "désactivée" in provider_status(model)


def test_free_plan_only_uses_free_models(monkeypatch):
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", True)  # tout le reste « disponible »
    request = RouteRequest(intent="restyle", window_seconds=3, video_seconds=10)
    free_decision = choose_model(request, status=plan_status(free_only=True))
    assert free_decision.model.key == "joyai-edit-space"
    assert free_decision.rejected["lucy-2.6"] == "réservé à l'offre Studio"
    paid = choose_model(request, status=plan_status(free_only=False))
    assert paid.model.key != "joyai-edit-space" or paid.alternatives


# --- Protocole Gradio (sans reseau) ---


class _FakeStream:
    def __init__(self, lines):
        self._lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class _FakeSpaceClient:
    """Imite httpx.AsyncClient pour le Space : info, upload, call, flux SSE."""

    def __init__(self, sse_lines, calls):
        self.sse_lines = sse_lines
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        info = {
            "named_endpoints": {
                "/edit_video_submit": {"parameters": [{"parameter_name": "video_path"}]},
                "/edit_video_1": {
                    "parameters": [
                        {"parameter_name": "video_path"},
                        {"parameter_name": "instruction"},
                    ]
                },
            }
        }
        return FakeResponse(200, json_data=info)

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        if url.endswith("/gradio_api/upload"):
            return FakeResponse(200, json_data=["/tmp/gradio/abc/piece.mp4"])
        return FakeResponse(200, json_data={"event_id": "evt1"})

    def stream(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return _FakeStream(self.sse_lines)


def _job(tmp_path):
    video = tmp_path / "piece.mp4"
    video.write_bytes(b"fake")
    model = catalog.get_model("joyai-edit-space")
    return EditJobInput(
        model=model, tier=model.tier("standard"), video_path=video, prompt="Make it snow"
    )


@pytest.fixture()
def fake_space(monkeypatch):
    calls = []
    state = {"lines": []}

    def factory(timeout=120.0):
        return _FakeSpaceClient(state["lines"], calls)

    monkeypatch.setattr(hf_space.HfSpaceEditProvider, "_client", staticmethod(factory))
    monkeypatch.setattr(
        ffmpeg, "probe", lambda path: ffmpeg.VideoInfo(2.0, 640, 360, 24.0, False, 100)
    )
    provider = hf_space.HfSpaceEditProvider()
    return provider, calls, state


def test_submit_uploads_anonymously_and_consumes_budget(tmp_path, fake_space, isolated_budget):
    provider, calls, _ = fake_space
    remote = json.loads(asyncio.run(provider.submit(_job(tmp_path))))
    assert remote == {"endpoint": "edit_video_1", "event_id": "evt1"}
    call = next(c for c in calls if c[1].endswith("/call/edit_video_1"))
    data = call[2]["json"]["data"]
    assert data[0]["path"] == "/tmp/gradio/abc/piece.mp4"
    assert data[1] == "Make it snow"
    assert data[2] == 2.0
    assert all("headers" not in c[2] for c in calls)  # aucun jeton envoye
    assert isolated_budget.remaining() == pytest.approx(110 - hf_space.estimate_gpu_seconds(2.0))


def test_submit_refused_when_budget_too_low(tmp_path, fake_space, isolated_budget):
    provider, calls, _ = fake_space
    isolated_budget.consume(100)
    with pytest.raises(EditProviderError, match="limite du jour"):
        asyncio.run(provider.submit(_job(tmp_path)))
    assert calls == []  # rien n'a ete envoye au Space


def test_poll_reads_final_video(tmp_path, fake_space):
    provider, _, state = fake_space
    output = [
        {"url": "https://x.hf.space/gradio_api/file=/tmp/p.webp"},
        {"url": "https://x.hf.space/gradio_api/file=/tmp/out.mp4"},
        "**done**",
    ]
    state["lines"] = [
        "event: generating",
        "data: []",
        "event: complete",
        f"data: {json.dumps(output)}",
    ]
    remote = json.dumps({"endpoint": "edit_video_1", "event_id": "evt1"})
    result = asyncio.run(provider.poll(remote, _job(tmp_path)))
    assert (result.state, result.video_url) == (
        "done",
        "https://x.hf.space/gradio_api/file=/tmp/out.mp4",
    )


def test_poll_quota_error_exhausts_budget(tmp_path, fake_space, isolated_budget):
    provider, _, state = fake_space
    state["lines"] = ["event: error", 'data: "You have exceeded your free GPU quota"']
    remote = json.dumps({"endpoint": "edit_video_1", "event_id": "evt1"})
    result = asyncio.run(provider.poll(remote, _job(tmp_path)))
    assert result.state == "failed"
    assert "limite du jour" in result.error
    assert isolated_budget.remaining() == 0


def test_provider_is_registered():
    assert isinstance(get_provider("hf_space"), hf_space.HfSpaceEditProvider)


# --- Duree exacte des passages (le Space renvoie un peu moins d'images) ---


@needs_ffmpeg
def test_normalize_pads_short_output_to_exact_duration(tmp_path):
    short = tmp_path / "short.mp4"
    subprocess.run(
        [
            shutil.which("ffmpeg"),
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=0.7:size=720x1248:rate=24",
            "-pix_fmt",
            "yuv420p",
            str(short),
        ],
        check=True,
        capture_output=True,
        timeout=60,
    )
    out = ffmpeg.normalize(short, tmp_path / "norm.mp4", 352, 640, 30.0, duration=1.0)
    info = ffmpeg.probe(out)
    assert info.duration == pytest.approx(1.0, abs=0.05)
    assert (info.width, info.height) == (352, 640)


@needs_ffmpeg
def test_probe_reports_display_size_of_rotated_phone_video(tmp_path):
    """Une video de telephone « couchee » (rotation -90) est sondee en portrait."""
    raw = tmp_path / "raw.mp4"
    rotated = tmp_path / "rotated.mp4"
    ffmpeg_bin = shutil.which("ffmpeg")
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=640x352:rate=24",
            "-pix_fmt",
            "yuv420p",
            str(raw),
        ],
        check=True,
        capture_output=True,
        timeout=60,
    )
    subprocess.run(
        [ffmpeg_bin, "-y", "-display_rotation", "-90", "-i", str(raw), "-c", "copy", str(rotated)],
        check=True,
        capture_output=True,
        timeout=60,
    )
    info = ffmpeg.probe(rotated)
    assert (info.width, info.height) == (352, 640)
    assert info.aspect_ratio == "9:16"


def test_free_plan_features_are_honest(monkeypatch):
    from server.accounts.plans import get_plan

    monkeypatch.setattr(config, "PLAN_FREE_ONLY_FREE_MODELS", True)
    features = get_plan("free").features
    assert "Qualité HD (720p)" in features
    assert any("open source gratuit" in feature for feature in features)
    monkeypatch.setattr(config, "PLAN_FREE_ONLY_FREE_MODELS", False)
    assert not any("open source" in feature for feature in get_plan("free").features)


def test_options_show_paid_only_quality_as_studio(auth_client, monkeypatch):
    monkeypatch.setattr(config, "PLAN_FREE_ONLY_FREE_MODELS", True)
    monkeypatch.setattr(config, "FAL_API_KEY", "k")  # Luma absent, Kling O3 (fal) present
    monkeypatch.setattr(config, "LUMA_API_KEY", "k")
    qualities = {
        q["key"]: q for q in auth_client.get("/api/video-edits/options").json()["qualities"]
    }
    assert qualities["standard"]["included"] and qualities["standard"]["available"]
    assert qualities["draft"]["included"] is False  # seule Luma (payante) propose « Rapide »
