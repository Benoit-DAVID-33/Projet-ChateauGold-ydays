"""Tests du proxy multi-fournisseurs (routeur, quotas, fournisseurs, routes)."""

import asyncio

import pytest

from server.llm import (
    Capability,
    GenerationRequest,
    GenerationResult,
    Provider,
    ProviderError,
    QuotaTracker,
    Router,
)
from server.llm.kling_provider import KlingProvider
from server.llm.openai_provider import OpenAICompatibleProvider, _extract_text


class FakeProvider(Provider):
    """Fournisseur de test : enregistre les demandes et peut echouer a volonte."""

    def __init__(self, name, capabilities, fail=False):
        self.name = name
        self.capabilities = frozenset(capabilities)
        self.fail = fail
        self.submitted = []

    async def submit(self, request):
        self.submitted.append(request)
        if self.fail:
            raise ProviderError(self.name, "panne simulée")
        return GenerationResult(self.name, f"{self.name}:1", "submitted", {"ok": True})

    async def status(self, task_id):
        return GenerationResult(self.name, task_id, "succeed", {})

    async def health(self):
        return not self.fail


def _request(capability=Capability.VIDEO, prompt="un chat"):
    return GenerationRequest(capability=capability, prompt=prompt)


# --- QuotaTracker ---


def test_quota_unlimited_by_default():
    quota = QuotaTracker()
    assert quota.available("kling") is True
    assert quota.remaining("kling") is None


def test_quota_limit_is_enforced():
    quota = QuotaTracker({"kling": 1})
    assert quota.available("kling") is True
    quota.consume("kling")
    assert quota.available("kling") is False
    assert quota.remaining("kling") == 0


# --- Router ---


def test_router_picks_first_eligible_by_priority():
    kling = FakeProvider("kling", [Capability.VIDEO])
    local = FakeProvider("local", [Capability.TEXT])
    router = Router([kling, local])
    result = asyncio.run(router.submit(_request()))
    assert result.provider == "kling"


def test_router_skips_incapable_provider():
    local = FakeProvider("local", [Capability.TEXT])
    hf = FakeProvider("huggingface", [Capability.TEXT])
    router = Router([local, hf])
    result = asyncio.run(router.submit(_request(Capability.TEXT)))
    assert result.provider == "local"


def test_router_falls_back_on_failure():
    kling = FakeProvider("kling", [Capability.VIDEO], fail=True)
    backup = FakeProvider("backup", [Capability.VIDEO])
    router = Router([kling, backup])
    result = asyncio.run(router.submit(_request()))
    assert result.provider == "backup"


def test_router_skips_provider_over_quota():
    kling = FakeProvider("kling", [Capability.VIDEO])
    backup = FakeProvider("backup", [Capability.VIDEO])
    router = Router([kling, backup], QuotaTracker({"kling": 1}))
    asyncio.run(router.submit(_request()))
    result = asyncio.run(router.submit(_request()))
    assert result.provider == "backup"


def test_router_raises_when_no_provider():
    router = Router([FakeProvider("local", [Capability.TEXT])])
    with pytest.raises(ProviderError):
        asyncio.run(router.submit(_request(Capability.VIDEO)))


def test_router_keeps_task_coherence():
    kling = FakeProvider("kling", [Capability.VIDEO])
    router = Router([kling])
    result = asyncio.run(router.submit(_request()))
    status = asyncio.run(router.status(result.task_id))
    assert status.status == "succeed"


def test_router_status_unknown_task():
    router = Router([FakeProvider("kling", [Capability.VIDEO])])
    with pytest.raises(ProviderError):
        asyncio.run(router.status("inconnu"))


def test_router_health_reports_each_provider():
    router = Router(
        [FakeProvider("ok", [Capability.TEXT]), FakeProvider("ko", [Capability.TEXT], fail=True)]
    )
    assert asyncio.run(router.health()) == {"ok": True, "ko": False}


# --- OpenAICompatibleProvider ---


def test_openai_provider_not_configured():
    provider = OpenAICompatibleProvider("huggingface", base_url="", model="")
    assert provider.configured is False
    assert asyncio.run(provider.health()) is False
    with pytest.raises(ProviderError):
        asyncio.run(provider.submit(_request(Capability.TEXT)))


def test_openai_provider_extract_text():
    payload = {"choices": [{"message": {"content": "bonjour"}}]}
    assert _extract_text(payload) == "bonjour"
    assert _extract_text({}) == ""


# --- KlingProvider ---


def test_kling_provider_submit_and_status(monkeypatch):
    from server import kling

    async def fake_generate_video(prompt, **options):
        return {"code": 0, "data": {"task_id": "abc", "task_status": "submitted"}}

    async def fake_get_video_task(task_id):
        return {"code": 0, "data": {"task_status": "succeed"}}

    monkeypatch.setattr(kling, "generate_video", fake_generate_video)
    monkeypatch.setattr(kling, "get_video_task", fake_get_video_task)

    provider = KlingProvider()
    result = asyncio.run(provider.submit(_request(Capability.VIDEO)))
    assert result.task_id == "video:abc"
    assert result.provider == "kling"

    status = asyncio.run(provider.status(result.task_id))
    assert status.status == "succeed"


def test_kling_provider_rejects_unsupported_capability():
    provider = KlingProvider()
    with pytest.raises(ProviderError):
        asyncio.run(provider.submit(_request(Capability.TEXT)))


# --- Routes ---


def test_llm_providers_route(auth_client, monkeypatch):
    from server.routers import llm as llm_router

    router = Router(
        [FakeProvider("kling", [Capability.VIDEO]), FakeProvider("local", [Capability.TEXT])]
    )
    monkeypatch.setattr(llm_router, "get_router", lambda: router)

    response = auth_client.get("/api/llm/providers")
    assert response.status_code == 200
    names = [item["name"] for item in response.json()["providers"]]
    assert names == ["kling", "local"]


def test_llm_generate_route(auth_client, monkeypatch):
    from server.routers import llm as llm_router

    router = Router([FakeProvider("kling", [Capability.VIDEO])])
    monkeypatch.setattr(llm_router, "get_router", lambda: router)

    response = auth_client.post(
        "/api/llm/generate", json={"capability": "video", "prompt": "une vague"}
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "kling"


def test_llm_generate_route_no_provider(auth_client, monkeypatch):
    from server.routers import llm as llm_router

    router = Router([FakeProvider("local", [Capability.TEXT])])
    monkeypatch.setattr(llm_router, "get_router", lambda: router)

    response = auth_client.post("/api/llm/generate", json={"capability": "video", "prompt": "x"})
    assert response.status_code == 502
    assert "error" in response.json()


def test_llm_routes_require_auth(client):
    assert client.get("/api/llm/providers").status_code == 401
