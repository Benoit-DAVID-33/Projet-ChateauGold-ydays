"""Tests de la construction du routeur multi-fournisseurs (registry)."""

from server import config
from server.llm import Capability, build_router
from server.llm.openai_provider import OpenAICompatibleProvider


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
