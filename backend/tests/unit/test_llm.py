"""Tests du proxy multi-fournisseurs (routeur, quotas, fournisseurs, routes)."""

import asyncio
from typing import ClassVar

import pytest

from server.proxy import (
    Capability,
    GenerationRequest,
    GenerationResult,
    Provider,
    ProviderError,
    QuotaTracker,
    Router,
)
from server.proxy.kling_generation import KlingProvider
from server.proxy.openai_compatible import OpenAICompatibleProvider, _extract_text


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
    from server.integrations import kling_api as kling

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
    from server.api import proxy as llm_router

    router = Router(
        [FakeProvider("kling", [Capability.VIDEO]), FakeProvider("local", [Capability.TEXT])]
    )
    monkeypatch.setattr(llm_router, "get_router", lambda: router)

    response = auth_client.get("/api/llm/providers")
    assert response.status_code == 200
    names = [item["name"] for item in response.json()["providers"]]
    assert names == ["kling", "local"]


def test_llm_generate_route(auth_client, monkeypatch):
    from server.api import proxy as llm_router

    router = Router([FakeProvider("kling", [Capability.VIDEO])])
    monkeypatch.setattr(llm_router, "get_router", lambda: router)

    response = auth_client.post(
        "/api/llm/generate", json={"capability": "video", "prompt": "une vague"}
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "kling"


def test_llm_generate_route_no_provider(auth_client, monkeypatch):
    from server.api import proxy as llm_router

    router = Router([FakeProvider("local", [Capability.TEXT])])
    monkeypatch.setattr(llm_router, "get_router", lambda: router)

    response = auth_client.post("/api/llm/generate", json={"capability": "video", "prompt": "x"})
    assert response.status_code == 502
    assert "error" in response.json()


def test_llm_routes_require_auth(client):
    assert client.get("/api/llm/providers").status_code == 401


# --- Politique « gratuit uniquement » ---


class PaidProvider(FakeProvider):
    """Fournisseur payant (free=False par defaut dans Provider)."""


class FreeProvider(FakeProvider):
    """Fournisseur declare gratuit."""

    @property
    def free(self):
        return True


class UnconfiguredProvider(FreeProvider):
    """Fournisseur gratuit mais sans configuration (cle absente)."""

    @property
    def configured(self):
        return False


def test_free_only_router_skips_paid_providers():
    paid = PaidProvider("huggingface", [Capability.TEXT])
    free = FreeProvider("local", [Capability.TEXT])
    router = Router([paid, free], free_only=True)
    result = asyncio.run(router.submit(_request(Capability.TEXT)))
    assert result.provider == "local"
    assert paid.submitted == []


def test_free_only_router_refuses_when_only_paid():
    paid = PaidProvider("kling", [Capability.VIDEO])
    router = Router([paid], free_only=True)
    with pytest.raises(ProviderError, match="gratuit"):
        asyncio.run(router.submit(_request()))
    assert paid.submitted == []


def test_router_skips_unconfigured_provider():
    missing = UnconfiguredProvider("openrouter", [Capability.TEXT])
    local = FreeProvider("local", [Capability.TEXT])
    router = Router([missing, local], free_only=True)
    assert asyncio.run(router.submit(_request(Capability.TEXT))).provider == "local"
    assert missing.submitted == []


def test_describe_reports_billing_and_eligibility():
    router = Router(
        [PaidProvider("kling", [Capability.VIDEO]), FreeProvider("local", [Capability.TEXT])],
        free_only=True,
    )
    described = {item["name"]: item for item in asyncio.run(router.describe())}
    assert described["kling"]["eligible"] is False
    assert "LLM_FREE_ONLY" in described["kling"]["reason"]
    assert described["local"]["eligible"] is True
    assert described["local"]["free"] is True


# --- Quotas quotidiens et persistance ---


def test_quota_resets_on_new_day():
    day = {"value": "2026-11-01"}
    quota = QuotaTracker({"groq": 1}, today=lambda: day["value"])
    quota.consume("groq")
    assert quota.available("groq") is False
    day["value"] = "2026-11-02"
    assert quota.available("groq") is True
    assert quota.remaining("groq") == 1


def test_quota_is_persisted(tmp_path):
    path = tmp_path / "quota.json"
    QuotaTracker({"groq": 2}, path=path, today=lambda: "2026-11-02").consume("groq")
    reloaded = QuotaTracker({"groq": 2}, path=path, today=lambda: "2026-11-02")
    assert reloaded.remaining("groq") == 1
    next_day = QuotaTracker({"groq": 2}, path=path, today=lambda: "2026-11-03")
    assert next_day.remaining("groq") == 2


def test_quota_ignores_corrupted_file(tmp_path):
    path = tmp_path / "quota.json"
    path.write_text("{pas du json", encoding="utf-8")
    assert QuotaTracker({"groq": 1}, path=path).available("groq") is True


# --- Fournisseurs compatibles OpenAI ---


class _FakeAsyncClient:
    """Remplace httpx.AsyncClient : renvoie des reponses programmees, enregistre les appels."""

    responses: ClassVar[list] = []
    calls: ClassVar[list] = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None, **kwargs):
        _FakeAsyncClient.calls.append(("POST", url, json, headers))
        return _FakeAsyncClient.responses.pop(0)

    async def get(self, url, headers=None, **kwargs):
        _FakeAsyncClient.calls.append(("GET", url, None, headers))
        return _FakeAsyncClient.responses.pop(0)


@pytest.fixture()
def fake_httpx(monkeypatch):
    import httpx

    _FakeAsyncClient.responses = []
    _FakeAsyncClient.calls = []
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    return _FakeAsyncClient


def test_openai_provider_requires_key_when_declared():
    provider = OpenAICompatibleProvider(
        "groq", base_url="https://x.test/v1", model="m", requires_key=True
    )
    assert provider.configured is False


def test_openai_provider_sends_system_message(fake_httpx):
    from helpers import FakeResponse

    fake_httpx.responses = [
        FakeResponse(200, json_data={"choices": [{"message": {"content": "ok"}}]})
    ]
    provider = OpenAICompatibleProvider("local", base_url="http://l.test/v1", model="m", free=True)
    request = GenerationRequest(Capability.TEXT, "salut", {"system": "consigne", "temperature": 0})
    result = asyncio.run(provider.submit(request))
    assert result.payload["text"] == "ok"
    body = fake_httpx.calls[0][2]
    assert body["messages"][0] == {"role": "system", "content": "consigne"}
    assert body["temperature"] == 0
    assert "system" not in body


def test_openai_provider_health_rejects_auth_errors(fake_httpx):
    from helpers import FakeResponse

    fake_httpx.responses = [FakeResponse(401, json_data={})]
    provider = OpenAICompatibleProvider(
        "groq", base_url="https://g.test/v1", model="m", api_key="k"
    )
    assert asyncio.run(provider.health()) is False


def _hf(**kwargs):
    from server.proxy.openai_compatible import HuggingFaceProvider

    return HuggingFaceProvider(
        base_url="https://router.test/v1", model="m", api_key="hf_test", **kwargs
    )


def test_huggingface_is_never_free():
    assert _hf().free is False


def test_huggingface_refuses_forbidden_account(fake_httpx):
    from helpers import FakeResponse

    fake_httpx.responses = [FakeResponse(200, json_data={"name": "DarkQuad"})]
    provider = _hf(forbidden_accounts=frozenset({"darkquad"}))
    with pytest.raises(ProviderError, match="interdit"):
        asyncio.run(provider.submit(_request(Capability.TEXT)))
    # Aucune requete d'inference n'est partie : seul whoami a ete appele.
    assert [call[0] for call in fake_httpx.calls] == ["GET"]


def test_huggingface_refuses_unexpected_account(fake_httpx):
    from helpers import FakeResponse

    fake_httpx.responses = [FakeResponse(200, json_data={"name": "quelquun"})]
    provider = _hf(expected_account="goldfx-projet")
    with pytest.raises(ProviderError, match="au lieu de"):
        asyncio.run(provider.submit(_request(Capability.TEXT)))


def test_huggingface_accepts_expected_account_and_bills_org(fake_httpx):
    from helpers import FakeResponse

    fake_httpx.responses = [
        FakeResponse(200, json_data={"name": "goldfx-projet"}),
        FakeResponse(200, json_data={"choices": [{"message": {"content": "ok"}}]}),
    ]
    provider = _hf(expected_account="goldfx-projet", bill_to="ynov-org")
    assert asyncio.run(provider.submit(_request(Capability.TEXT))).payload["text"] == "ok"
    assert fake_httpx.calls[1][3]["X-HF-Bill-To"] == "ynov-org"


def test_huggingface_fails_closed_when_whoami_fails(fake_httpx):
    from helpers import FakeResponse

    fake_httpx.responses = [FakeResponse(401, json_data={})]
    provider = _hf(forbidden_accounts=frozenset({"darkquad"}))
    with pytest.raises(ProviderError, match="invalide"):
        asyncio.run(provider.submit(_request(Capability.TEXT)))
