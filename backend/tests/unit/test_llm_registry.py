"""Tests de la construction du routeur multi-fournisseurs (registry)."""

from server import config
from server.proxy import Capability, build_router
from server.proxy.openai_compatible import OpenAICompatibleProvider


def test_build_router_follows_priority(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["kling", "local"])
    router = build_router()
    assert [provider.name for provider in router.providers] == ["kling", "local"]


def test_build_router_ignores_unknown_provider(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["kling", "inconnu"])
    router = build_router()
    assert [provider.name for provider in router.providers] == ["kling"]


def test_minimax_provider_is_openai_compatible(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["minimax"])
    monkeypatch.setattr(config, "MINIMAX_API_KEY", "test-key")
    provider = build_router().providers[0]
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.name == "minimax"
    assert provider.configured is True
    assert Capability.TEXT in provider.capabilities


def test_kling_provider_capabilities(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["kling"])
    provider = build_router().providers[0]
    assert provider.capabilities == frozenset({Capability.IMAGE, Capability.VIDEO})


def test_build_router_is_free_only_by_default(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["local", "huggingface", "kling"])
    monkeypatch.setattr(config, "LLM_QUOTA_FILE", tmp_path / "quota.json")
    router = build_router()
    assert router.free_only is True
    free = {provider.name: provider.free for provider in router.providers}
    assert free == {"local": True, "huggingface": False, "kling": False}


def test_openrouter_is_free_only_with_free_suffix(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["openrouter"])
    monkeypatch.setattr(config, "LLM_QUOTA_FILE", tmp_path / "quota.json")
    monkeypatch.setattr(config, "OPENROUTER_MODEL", "openai/gpt-oss-20b:free")
    assert build_router().providers[0].free is True
    monkeypatch.setattr(config, "OPENROUTER_MODEL", "openai/gpt-5")
    assert build_router().providers[0].free is False


def test_huggingface_never_uses_ambient_token(monkeypatch, tmp_path):
    monkeypatch.setenv("HF_TOKEN", "hf_jeton_personnel")
    monkeypatch.setattr(config, "HF_API_TOKEN", "")
    monkeypatch.setattr(config, "LLM_PROVIDER_PRIORITY", ["huggingface"])
    monkeypatch.setattr(config, "LLM_QUOTA_FILE", tmp_path / "quota.json")
    provider = build_router().providers[0]
    assert provider.configured is False
    assert "hf_jeton_personnel" not in str(provider._headers())
