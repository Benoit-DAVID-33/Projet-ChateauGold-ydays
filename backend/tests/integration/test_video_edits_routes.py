"""Tests des routes d'edition video, des offres, du chatbot et de l'administration."""

import shutil
import subprocess

import pytest

from server import config
from server.video_editing.service import get_service

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="ffmpeg/ffprobe absents",
)


@pytest.fixture()
def sample_video(media_folders):
    """Video de test de 8 s (mire + son) generee par FFmpeg."""
    video_folder, _ = media_folders
    path = video_folder / "sample.mp4"
    subprocess.run(
        [
            shutil.which("ffmpeg") or "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=8:size=320x180:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=8",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(path),
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return path.name


@pytest.fixture()
def simulate(monkeypatch):
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", True)


def test_routes_require_auth(client):
    assert client.get("/api/video-edits/models").status_code == 401
    assert client.post("/api/video-edits/preview", json={"filename": "x.mp4"}).status_code == 401


@pytest.fixture()
def admin(monkeypatch):
    monkeypatch.setattr(config, "ADMIN_USERS", frozenset({"Château Gold"}))


def test_models_route_is_admin_only(auth_client):
    assert auth_client.get("/api/video-edits/models").status_code == 403


def test_models_route_reports_availability_and_etag(auth_client, admin, monkeypatch):
    monkeypatch.setattr(config, "VIDEO_EDITING_SIMULATE", False)
    monkeypatch.setattr(config, "FAL_API_KEY", "")
    response = auth_client.get("/api/video-edits/models")
    assert response.status_code == 200
    models = {model["key"]: model for model in response.json()["models"]}
    assert models["kling-o3-edit"]["available"] is False
    assert "fal" in models["kling-o3-edit"]["unavailable_reason"]
    assert models["runway-aleph-2"]["integrated"] is False
    etag = response.headers["etag"]
    again = auth_client.get("/api/video-edits/models", headers={"If-None-Match": etag})
    assert again.status_code == 304


def test_options_route_hides_models(auth_client, simulate):
    data = auth_client.get("/api/video-edits/options").json()
    qualities = {q["key"]: q for q in data["qualities"]}
    assert list(qualities) == ["draft", "standard", "pro", "4k"]
    assert qualities["draft"]["label"] == "Rapide"
    assert qualities["standard"]["included"] is True
    assert qualities["pro"]["included"] is False  # offre gratuite
    assert "models" not in qualities["pro"]
    assert data["usage"]["plan"] == "free"


def test_preview_unknown_video(auth_client, media_folders, simulate):
    response = auth_client.post("/api/video-edits/preview", json={"filename": "absent.mp4"})
    assert response.status_code == 404


@needs_ffmpeg
def test_preview_user_view_has_no_technical_details(auth_client, sample_video, simulate):
    response = auth_client.post(
        "/api/video-edits/preview",
        json={"filename": sample_video, "instructions": "à 2 s ajoute un chevalier"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["can_run"] is True
    assert data["quality_label"] == "HD · 720p"
    assert data["changes"][0]["start"] == 2.0
    assert [(s["start"], s["changes"]) for s in data["segments"]] == [(0.0, []), (2.0, [1])]
    text = str(data)
    assert "knight" not in text and "lucy" not in text and "technical" not in data
    assert any("démonstration" in n["text"] for n in data["notices"])
    assert get_service().store.list_for("Château Gold") == []  # aucun travail cree


@needs_ffmpeg
def test_preview_technical_plan_for_admins(auth_client, sample_video, simulate, admin):
    data = auth_client.post(
        "/api/video-edits/preview",
        json={"filename": sample_video, "instructions": "à 2 s ajoute un chevalier"},
    ).json()
    technical = data["technical"]
    assert technical["source"]["duration"] == pytest.approx(8.0, abs=0.1)
    call = technical["plan"]["segments"][1]["pieces"][0]["calls"][0]
    assert "knight" in call["prompt"]


@needs_ffmpeg
def test_preview_caps_quality_to_plan(auth_client, sample_video, simulate):
    data = auth_client.post(
        "/api/video-edits/preview",
        json={
            "filename": sample_video,
            "edits": [{"instruction": "ajoute un chapeau"}],
            "quality": "4k",
        },
    ).json()
    assert data["quality"] == "standard"
    assert any("réservée à l'offre Studio" in n["text"] for n in data["notices"])


@needs_ffmpeg
def test_preview_blocks_too_many_edits_for_free_plan(auth_client, sample_video, simulate):
    edits = [{"instruction": f"ajoute un chapeau numéro {i}", "start": i} for i in range(3)]
    data = auth_client.post(
        "/api/video-edits/preview", json={"filename": sample_video, "edits": edits}
    ).json()
    assert data["can_run"] is False
    blockers = [n["text"] for n in data["notices"] if n["kind"] == "blocker"]
    assert any("modifications demandées" in text for text in blockers)


@needs_ffmpeg
def test_full_simulated_job_keeps_duration_and_audio(
    auth_client, sample_video, simulate, media_folders, monkeypatch
):
    import asyncio

    from server.media import ffmpeg
    from server.video_editing import pipeline
    from server.video_editing.jobs import JobQueue

    async def keep_in_queue(self, job):
        return None  # le travail est execute explicitement ci-dessous (pas de course)

    monkeypatch.setattr(JobQueue, "submit", keep_in_queue)
    response = auth_client.post(
        "/api/video-edits",
        json={
            "filename": sample_video,
            "edits": [{"instruction": "intègre un chevalier", "start": 2, "end": 5}],
        },
    )
    assert response.status_code == 202
    job_id = response.json()["job"]["id"]
    assert "file_token" not in response.json()["job"]
    assert "plan" not in response.json()["job"]

    service = get_service()
    job = service.store.get(job_id)
    job.status = "running"
    asyncio.run(pipeline.run(job, service.store))
    assert job.status == "done"
    assert job.progress == 1.0
    result = media_folders[0] / job.result_filename
    info = ffmpeg.probe(result)
    assert info.duration == pytest.approx(8.0, abs=0.15)
    assert (info.width, info.height) == (320, 180)
    assert info.has_audio

    status = auth_client.get(f"/api/video-edits/{job_id}").json()
    assert status["status"] == "done"
    assert auth_client.get("/api/video-edits").json()["jobs"][0]["id"] == job_id


def test_job_status_is_private(auth_client):
    assert auth_client.get("/api/video-edits/inconnu").status_code == 404


def test_job_files_require_token(client):
    assert client.get("/api/video-edits/files/abc/badtoken/piece.mp4").status_code == 404


def test_cancel_unknown_job(auth_client):
    assert auth_client.post("/api/video-edits/inconnu/cancel").status_code == 404


# --- Offres ---


def test_plans_are_public_and_honest(client):
    data = client.get("/api/plans").json()
    assert data["online_payment"] is False
    assert {plan["key"] for plan in data["plans"]} == {"free", "studio"}


def test_my_plan_and_upgrade_request(auth_client, isolated_video_editing):
    assert auth_client.get("/api/plans/me").json()["plan"] == "free"
    response = auth_client.post("/api/plans/upgrade-request", json={"message": "clip"})
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert isolated_video_editing.pending_upgrades()[0]["message"] == "clip"


def test_set_plan_requires_admin(auth_client, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_USERS", frozenset())
    response = auth_client.post("/api/admin/users/bob/plan", json={"plan": "studio"})
    assert response.status_code == 403


def test_admin_grants_plan(auth_client, monkeypatch, isolated_video_editing):
    monkeypatch.setattr(config, "ADMIN_USERS", frozenset({"Château Gold"}))
    isolated_video_editing.request_upgrade("bob", "studio", "")
    response = auth_client.post("/api/admin/users/bob/plan", json={"plan": "studio"})
    assert response.json()["plan"] == "studio"
    assert isolated_video_editing.plan_of("bob").key == "studio"
    assert isolated_video_editing.pending_upgrades() == []
    assert auth_client.get("/api/admin/upgrade-requests").json()["requests"] == []


def test_admin_overview_includes_video_models_and_jobs(auth_client):
    data = auth_client.get("/api/admin/overview").json()
    assert any(model["key"] == "kling-o1" for model in data["video_models"])
    assert "by_status" in data["jobs"]


# --- Prompt : tri et chatbot ---


def test_triage_route(auth_client):
    data = auth_client.post(
        "/api/prompt/triage",
        json={"text": "à 2 s intègre un chevalier puis à 15 s ajoute un dragon"},
    ).json()
    assert [edit["timing"] for edit in data["edits"]] == [{"start": 2.0}, {"start": 15.0}]


def test_chat_route_falls_back_to_rules(auth_client):
    data = auth_client.post(
        "/api/prompt/chat",
        json={"messages": [{"role": "user", "content": "à 3 s ajoute un chevalier en armure"}]},
    ).json()
    assert data["source"] == "rules"
    assert data["edits"][0]["timing"] == {"start": 3.0}
    assert "knight" in data["edits"][0]["prompt"]


# --- Pages ---


@pytest.mark.skipif(
    not (config.TEMPLATES_DIR / "studio.html").exists(),
    reason="templates du front absents (branche backend seule)",
)
def test_studio_and_offers_pages(auth_client):
    assert auth_client.get("/studio").status_code == 200
    page = auth_client.get("/offres")
    assert page.status_code == 200
    assert "Découverte" in page.text and "Studio" in page.text


def test_request_id_and_timing_headers(client):
    response = client.get("/login", headers={"X-Request-ID": "abc123-test"})
    assert response.headers["x-request-id"] == "abc123-test"
    assert response.headers["server-timing"].startswith("app;dur=")
