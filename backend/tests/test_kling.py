"""Tests du client Kling : JWT, appels, erreurs typees et reessais."""

import asyncio

import httpx
import pytest
from helpers import FakeClient, FakeResponse

from server import config, kling


@pytest.fixture(autouse=True)
def _no_retry_delay(monkeypatch):
    """Supprime les attentes entre reessais pour accelerer les tests."""

    async def _instant(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", _instant)


def test_generate_jwt_token(kling_keys):
    token = kling.generate_jwt_token()
    assert isinstance(token, str)
    assert token.count(".") == 2


def test_test_connection_without_keys(monkeypatch):
    monkeypatch.setattr(config, "KLING_ACCESS_KEY", "")
    monkeypatch.setattr(config, "KLING_SECRET_KEY", "")
    result = asyncio.run(kling.test_connection())
    assert result["ok"] is False


def test_test_connection_success(kling_keys, monkeypatch):
    monkeypatch.setattr(
        kling, "get_client", lambda: FakeClient(FakeResponse(200, json_data={"code": 0}))
    )
    result = asyncio.run(kling.test_connection())
    assert result["ok"] is True


def test_test_connection_unauthorized(kling_keys, monkeypatch):
    monkeypatch.setattr(
        kling, "get_client", lambda: FakeClient(FakeResponse(401, json_data={"code": 1002}))
    )
    result = asyncio.run(kling.test_connection())
    assert result["ok"] is False


def test_generate_image(kling_keys, monkeypatch):
    fake = FakeClient(FakeResponse(200, json_data={"code": 0, "data": {"task_id": "t1"}}))
    monkeypatch.setattr(kling, "get_client", lambda: fake)
    data = asyncio.run(kling.generate_image("un chat"))
    assert data["data"]["task_id"] == "t1"
    assert fake.calls[0][1] == "/v1/images/generations"


def test_generate_video(kling_keys, monkeypatch):
    monkeypatch.setattr(
        kling,
        "get_client",
        lambda: FakeClient(FakeResponse(200, json_data={"code": 0, "data": {"task_id": "v1"}})),
    )
    data = asyncio.run(kling.generate_video("une vague"))
    assert data["data"]["task_id"] == "v1"


def test_image_to_video(kling_keys, monkeypatch):
    fake = FakeClient(FakeResponse(200, json_data={"code": 0, "data": {"task_id": "i1"}}))
    monkeypatch.setattr(kling, "get_client", lambda: fake)
    data = asyncio.run(kling.image_to_video("http://img", prompt="bouge"))
    assert data["data"]["task_id"] == "i1"
    assert fake.calls[0][2]["json"]["prompt"] == "bouge"


def test_omni_video_base_drops_duration(kling_keys, monkeypatch):
    fake = FakeClient(FakeResponse(200, json_data={"code": 0, "data": {"task_id": "o1"}}))
    monkeypatch.setattr(kling, "get_client", lambda: fake)
    asyncio.run(kling.omni_video(prompt="transforme", video_url="http://v", refer_type="base"))
    payload = fake.calls[0][2]["json"]
    assert "duration" not in payload
    assert payload["video_list"][0]["refer_type"] == "base"


def test_get_tasks(kling_keys, monkeypatch):
    monkeypatch.setattr(
        kling,
        "get_client",
        lambda: FakeClient(
            FakeResponse(200, json_data={"code": 0, "data": {"task_status": "succeed"}})
        ),
    )
    assert asyncio.run(kling.get_video_task("v"))["data"]["task_status"] == "succeed"
    assert asyncio.run(kling.get_image2video_task("i"))["data"]["task_status"] == "succeed"
    assert asyncio.run(kling.get_omni_video_task("o"))["data"]["task_status"] == "succeed"


def test_kling_business_code_raises(kling_keys, monkeypatch):
    monkeypatch.setattr(
        kling,
        "get_client",
        lambda: FakeClient(FakeResponse(200, json_data={"code": 1234, "message": "boom"})),
    )
    with pytest.raises(kling.KlingError) as exc:
        asyncio.run(kling.generate_image("x"))
    assert exc.value.code == 1234
    assert exc.value.http_status == 502


def test_http_error_mapped(kling_keys, monkeypatch):
    monkeypatch.setattr(
        kling, "get_client", lambda: FakeClient(FakeResponse(400, json_data={"message": "bad"}))
    )
    with pytest.raises(kling.KlingError) as exc:
        asyncio.run(kling.generate_image("x"))
    assert exc.value.http_status == 502


def test_unauthorized_mapped(kling_keys, monkeypatch):
    monkeypatch.setattr(kling, "get_client", lambda: FakeClient(FakeResponse(403, json_data={})))
    with pytest.raises(kling.KlingError) as exc:
        asyncio.run(kling.generate_image("x"))
    assert exc.value.code == "auth"


def test_timeout_mapped(kling_keys, monkeypatch):
    class TimeoutClient:
        async def request(self, *args, **kwargs):
            raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(kling, "get_client", lambda: TimeoutClient())
    with pytest.raises(kling.KlingError) as exc:
        asyncio.run(kling.generate_image("x"))
    assert exc.value.http_status == 504


def test_network_error_mapped(kling_keys, monkeypatch):
    class DownClient:
        async def request(self, *args, **kwargs):
            raise httpx.ConnectError("down")

    monkeypatch.setattr(kling, "get_client", lambda: DownClient())
    with pytest.raises(kling.KlingError) as exc:
        asyncio.run(kling.generate_image("x"))
    assert exc.value.http_status == 502


def test_retry_on_rate_limit_then_success(kling_keys, monkeypatch):
    fake = FakeClient(
        [FakeResponse(429, json_data={}), FakeResponse(200, json_data={"code": 0, "data": {}})]
    )
    monkeypatch.setattr(kling, "get_client", lambda: fake)
    monkeypatch.setattr(config, "KLING_MAX_RETRIES", 2)
    asyncio.run(kling.get_image_task("t"))
    assert len(fake.calls) == 2


def test_rate_limit_exhausted(kling_keys, monkeypatch):
    monkeypatch.setattr(kling, "get_client", lambda: FakeClient(FakeResponse(429, json_data={})))
    monkeypatch.setattr(config, "KLING_MAX_RETRIES", 2)
    with pytest.raises(kling.KlingError) as exc:
        asyncio.run(kling.get_image_task("t"))
    assert exc.value.http_status == 503
