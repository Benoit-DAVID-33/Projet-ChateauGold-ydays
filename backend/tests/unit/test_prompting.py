"""Tests unitaires de l'amelioration de prompt (prompt engineering video-to-video)."""

import asyncio

from server import llm, prompting
from server.llm import Capability, GenerationResult, Provider


class FakeTextProvider(Provider):
    """Fournisseur texte de test qui renvoie un prompt reecrit."""

    name = "fake"
    capabilities = frozenset({Capability.TEXT})

    async def submit(self, request):
        return GenerationResult(self.name, "", "succeeded", {"text": "Prompt réécrit par le LLM."})

    async def status(self, task_id):
        raise NotImplementedError

    async def health(self):
        return True


class FailingProvider(Provider):
    """Fournisseur texte qui echoue (doit declencher le repli)."""

    name = "ko"
    capabilities = frozenset({Capability.TEXT})

    async def submit(self, request):
        from server.llm import ProviderError

        raise ProviderError(self.name, "indisponible")

    async def status(self, task_id):
        raise NotImplementedError

    async def health(self):
        return False


def test_detects_remove_intent():
    result = prompting.enhance_with_rules("enlève la personne derrière", "kling")
    assert result.intent == "remove"
    assert "Supprime" in result.enhanced
    assert result.source == "rules"


def test_detects_replace_intent_and_extracts_parts():
    result = prompting.enhance_with_rules("remplace la voiture par un vélo", "kling")
    assert result.intent == "replace"
    assert "un vélo" in result.enhanced
    assert "la voiture" in result.enhanced


def test_detects_restyle_intent():
    result = prompting.enhance_with_rules("mets un style anime", "kling")
    assert result.intent == "restyle"


def test_detects_add_intent():
    result = prompting.enhance_with_rules("ajoute un chapeau rouge", "kling")
    assert result.intent == "add"
    assert "un chapeau rouge" in result.enhanced


def test_detects_english_intents():
    assert prompting.enhance_with_rules("remove the bystanders", "kling").intent == "remove"
    assert prompting.enhance_with_rules("add a hat", "kling").intent == "add"


def test_generic_fallback_keeps_user_text():
    result = prompting.enhance_with_rules("fais quelque chose de joli", "kling")
    assert result.intent == "generic"
    assert "fais quelque chose de joli" in result.enhanced


def test_keep_clause_and_tips_are_provided():
    result = prompting.enhance_with_rules("enlève le logo", "kling")
    assert result.keep
    assert any("anglais" in tip for tip in result.tips)


def test_model_specific_templates_differ():
    kling = prompting.enhance_with_rules("enlève la voiture", "kling").enhanced
    luma = prompting.enhance_with_rules("enlève la voiture", "luma").enhanced
    assert kling != luma


def test_unknown_model_falls_back_to_generic():
    result = prompting.enhance_with_rules("enlève la voiture", "inconnu")
    assert result.model == "inconnu"
    assert result.enhanced


def test_detects_multiple_intents_and_truncates():
    result = prompting.enhance_with_rules(
        "enlève la personne derrière et mets un ciel de nuit", "kling"
    )
    assert result.intent == "remove"
    assert "la personne derrière" in result.enhanced
    assert "ciel de nuit" not in result.enhanced
    assert any("Plusieurs modifications" in tip for tip in result.tips)


def test_single_intent_has_no_multi_tip():
    result = prompting.enhance_with_rules("enlève la personne derrière", "kling")
    assert not any("Plusieurs modifications" in tip for tip in result.tips)


def test_as_dict_is_serializable():
    payload = prompting.as_dict(prompting.enhance_with_rules("ajoute un chat", "kling"))
    assert set(payload) >= {"original", "enhanced", "intent", "model", "keep", "tips", "source"}


def test_enhance_uses_rules_without_llm():
    result = asyncio.run(prompting.enhance("ajoute un chat", "kling", use_llm=False))
    assert result.source == "rules"


def test_enhance_with_llm_uses_provider(monkeypatch):
    router = llm.Router([FakeTextProvider()])
    monkeypatch.setattr(llm, "get_router", lambda: router)
    result = asyncio.run(prompting.enhance("ajoute un chat", "kling", use_llm=True))
    assert result.source == "llm"
    assert result.enhanced == "Prompt réécrit par le LLM."


def test_enhance_with_llm_falls_back_on_failure(monkeypatch):
    router = llm.Router([FailingProvider()])
    monkeypatch.setattr(llm, "get_router", lambda: router)
    result = asyncio.run(prompting.enhance("ajoute un chat", "kling", use_llm=True))
    assert result.source == "rules"
