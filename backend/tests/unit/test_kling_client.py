from __future__ import annotations

import json

import httpx
import jwt
import pytest
import respx

from goldfx.domain.errors import ConfigurationError, ExternalServiceError, RateLimitedError
from goldfx.domain.models import GenerationKind, GenerationStatus
from goldfx.domain.ports import GenerationRequest
from goldfx.infrastructure.kling.client import KlingClient, KlingConfig

BASE = "https://kling.test"
SECRET = "kling-secret-key-for-tests-0123456789"


def make_client(access: str = "ak", secret: str = SECRET) -> KlingClient:
    return KlingClient(
        KlingConfig(
            base_url=BASE,
            access_key=access,
            secret_key=secret,
            image_model="kling-v1",
            video_model="kling-v1",
            omni_model="kling-video-o1",
            timeout_seconds=5,
            download_timeout_seconds=5,
        )
    )


def ok(data: dict[str, object]) -> httpx.Response:
    return httpx.Response(200, json={"code": 0, "message": "SUCCEED", "data": data})


@respx.mock
def test_submit_text_to_image_sends_signed_jwt_and_payload() -> None:
    route = respx.post(f"{BASE}/v1/images/generations").mock(return_value=ok({"task_id": "t1"}))
    task = make_client().submit(
        GenerationRequest(GenerationKind.TEXT_TO_IMAGE, prompt="un chat doré", count=2)
    )
    assert task == "t1"
    request = route.calls.last.request
    token = request.headers["Authorization"].removeprefix("Bearer ")
    claims = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert claims["iss"] == "ak"
    body = json.loads(request.content)
    assert body == {
        "prompt": "un chat doré",
        "model_name": "kling-v1",
        "n": 2,
        "aspect_ratio": "16:9",
    }


@respx.mock
def test_omni_video_base_mode_drops_duration_and_ratio() -> None:
    route = respx.post(f"{BASE}/v1/videos/omni-video").mock(return_value=ok({"task_id": "t2"}))
    make_client().submit(
        GenerationRequest(
            GenerationKind.OMNI_VIDEO,
            prompt="ajoute des étincelles",
            mode="pro",
            aspect_ratio="16:9",
            video_url="https://app/api/public/media/tok",
        )
    )
    body = json.loads(route.calls.last.request.content)
    assert "duration" not in body and "aspect_ratio" not in body
    assert body["video_list"] == [
        {"video_url": "https://app/api/public/media/tok", "refer_type": "base",
         "keep_original_sound": "yes"}
    ]  # fmt: skip
    assert body["model_name"] == "kling-video-o1"


@respx.mock
def test_image_to_video_without_prompt() -> None:
    route = respx.post(f"{BASE}/v1/videos/image2video").mock(return_value=ok({"task_id": "t3"}))
    make_client().submit(
        GenerationRequest(GenerationKind.IMAGE_TO_VIDEO, prompt="", image_base64="QUJD")
    )
    body = json.loads(route.calls.last.request.content)
    assert body["image"] == "QUJD" and "prompt" not in body


@respx.mock
def test_get_state_maps_status_and_results() -> None:
    respx.get(f"{BASE}/v1/videos/text2video/t1").mock(
        return_value=ok(
            {
                "task_status": "succeed",
                "task_result": {"videos": [{"id": "v", "url": "https://cdn/v.mp4"}]},
            }
        )
    )
    state = make_client().get_state(GenerationKind.TEXT_TO_VIDEO, "t1")
    assert state.status is GenerationStatus.SUCCEEDED
    assert state.result_urls == ["https://cdn/v.mp4"]


@respx.mock
def test_get_state_failed_message() -> None:
    respx.get(f"{BASE}/v1/images/generations/t1").mock(
        return_value=ok({"task_status": "failed", "task_status_msg": "contenu refusé"})
    )
    state = make_client().get_state(GenerationKind.TEXT_TO_IMAGE, "t1")
    assert state.status is GenerationStatus.FAILED
    assert state.error_message == "contenu refusé"


@respx.mock
@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(401, json={"code": 1000, "message": "auth"}), ExternalServiceError),
        (httpx.Response(429, json={"code": 1302}), RateLimitedError),
        (httpx.Response(200, json={"code": 1201, "message": "bad param"}), ExternalServiceError),
        (httpx.Response(500, text="oops"), ExternalServiceError),
    ],
)
def test_errors_are_translated(response: httpx.Response, error: type[Exception]) -> None:
    respx.post(f"{BASE}/v1/images/generations").mock(return_value=response)
    with pytest.raises(error):
        make_client().submit(GenerationRequest(GenerationKind.TEXT_TO_IMAGE, prompt="x"))


@respx.mock
def test_network_errors_are_translated() -> None:
    respx.post(f"{BASE}/v1/images/generations").mock(side_effect=httpx.ConnectTimeout("t"))
    with pytest.raises(ExternalServiceError, match="délai"):
        make_client().submit(GenerationRequest(GenerationKind.TEXT_TO_IMAGE, prompt="x"))


def test_missing_credentials() -> None:
    with pytest.raises(ConfigurationError):
        make_client(access="", secret="").submit(
            GenerationRequest(GenerationKind.TEXT_TO_IMAGE, prompt="x")
        )
    health = make_client(access="", secret="").check()
    assert not health.ok


@respx.mock
def test_check() -> None:
    respx.get(f"{BASE}/v1/images/generations").mock(return_value=ok({}))
    assert make_client().check().ok
    respx.get(f"{BASE}/v1/images/generations").mock(return_value=httpx.Response(401, json={}))
    assert not make_client().check().ok


@respx.mock
def test_download_limits() -> None:
    client = make_client()
    with pytest.raises(ExternalServiceError, match="non sécurisée"):
        client.download("http://cdn/x.png", 100)
    respx.get("https://cdn/x.png").mock(
        return_value=httpx.Response(200, content=b"1234", headers={"content-type": "image/png"})
    )
    assert client.download("https://cdn/x.png", 100) == (b"1234", "image/png")
    with pytest.raises(ExternalServiceError, match="volumineux"):
        client.download("https://cdn/x.png", 2)
