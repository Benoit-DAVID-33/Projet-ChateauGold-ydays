"""Tests unitaires de l'amelioration de prompt (prompt engineering video-to-video)."""

import asyncio

import pytest

from server import proxy as llm
from server.prompts import enhancer as prompting
from server.prompts import triage
from server.proxy import Capability, GenerationResult, Provider


class FakeTextProvider(Provider):
    """Fournisseur texte de test qui renvoie un prompt reecrit (JSON)."""

    name = "fake"
    capabilities = frozenset({Capability.TEXT})

    def __init__(self, text='{"prompts": ["Remove the man from the video."]}'):
        self.text = text
        self.requests = []

    async def submit(self, request):
        self.requests.append(request)
        return GenerationResult(self.name, "", "succeeded", {"text": self.text})

    async def status(self, task_id):
        raise NotImplementedError

    async def health(self):
        return True


class FailingProvider(Provider):
    """Fournisseur texte qui echoue (doit declencher le repli)."""

    name = "ko"
    capabilities = frozenset({Capability.TEXT})

    async def submit(self, request):
        from server.proxy import ProviderError

        raise ProviderError(self.name, "indisponible")

    async def status(self, task_id):
        raise NotImplementedError

    async def health(self):
        return False


def _rules(text, model="kling"):
    return prompting.enhance_with_rules(text, model)


# --- Intention ---


@pytest.mark.parametrize(
    ("text", "intent"),
    [
        ("enlève la personne derrière", "remove"),
        ("remplace la voiture par un vélo", "replace"),
        ("mets un style anime", "restyle"),
        ("ajoute un chapeau rouge", "add"),
        ("change la couleur de la voiture en rouge", "recolor"),
        ("rends la voiture bleue", "recolor"),
        ("remplace le fond par une plage", "background"),
        ("mets la scène de nuit", "weather"),
        ("ajoute de la neige", "add"),
        ("éclaire la scène avec une lumière dorée", "relight"),
        ("en gros plan", "angle"),
        ("génère le plan suivant", "next_shot"),
        ("remove the bystanders", "remove"),
        ("add a hat", "add"),
        ("fais quelque chose de joli", "generic"),
    ],
)
def test_detects_intent(text, intent):
    assert _rules(text).intent == intent


# --- Conversion anglaise et gabarit Kling ---


def test_kling_prompt_is_english_with_video_reference():
    result = _rules("remplace la voiture par un vélo")
    assert result.language == "en"
    assert result.translated is True
    assert "<<<video_1>>>" in result.enhanced
    assert "Replace the car" in result.enhanced
    assert "a bicycle" in result.enhanced
    assert "unchanged" in result.enhanced


def test_adjectives_are_reordered_in_english():
    result = _rules("ajoute un chapeau rouge à l'homme")
    assert "add a red hat to the man" in result.enhanced


def test_recolor_extracts_object_and_color():
    result = _rules("change la couleur de la voiture en rouge")
    assert "Change the color of the car in <<<video_1>>> to red" in result.enhanced


def test_background_replacement_is_not_multi_edit():
    result = _rules("remplace le fond par une plage tropicale au coucher de soleil")
    assert len(result.steps) == 1
    assert "tropical beach at sunset" in result.enhanced


def test_untranslatable_request_stays_french():
    result = _rules("ajoute un zorglub")
    assert result.language == "fr"
    assert result.translated is False
    assert "zorglub" in result.enhanced
    assert any("mode LLM" in tip for tip in result.tips)


def test_english_input_is_kept_as_is():
    result = _rules("replace the car with a red bike")
    assert "Replace the car in <<<video_1>>> with a red bike" in result.enhanced


def test_remove_adds_object_to_negative_prompt():
    result = _rules("enlève le logo")
    assert result.negative_prompt.startswith("the logo")


# --- Decoupage multi-modifications ---


def test_multi_edit_is_split_into_steps():
    result = _rules("enlève le logo en haut à droite et mets de la neige")
    assert [step.intent for step in result.steps] == ["remove", "weather"]
    assert "logo in the top right corner" in result.steps[0].prompt
    assert "snow" in result.steps[1].prompt
    assert any("Plusieurs modifications" in tip for tip in result.tips)


def test_conjunction_inside_description_does_not_split():
    result = _rules("transforme la vidéo en noir et blanc")
    assert len(result.steps) == 1


def test_split_edits_requires_action_verb():
    assert triage.split_edits("un chapeau rouge et noir") == ["un chapeau rouge et noir"]
    assert triage.split_edits("enlève le chat puis ajoute un chien") == [
        "enlève le chat",
        "ajoute un chien",
    ]


# --- Fiches modeles et parametres ---


def test_model_specific_templates_differ():
    kling = _rules("enlève la voiture", "kling").enhanced
    luma = _rules("enlève la voiture", "luma").enhanced
    assert kling != luma
    assert luma.startswith("The same scene without the car")


def test_decart_has_no_keep_clause():
    assert "unchanged" not in _rules("remplace la voiture par un vélo", "decart").enhanced


def test_every_profile_produces_a_prompt():
    for model in prompting.SUPPORTED_MODELS:
        assert _rules("ajoute un chapeau rouge", model).enhanced


def test_unknown_model_falls_back_to_generic():
    result = _rules("enlève la voiture", "inconnu")
    assert result.model == "generic"
    assert result.enhanced


def test_kling_params_follow_intent():
    assert _rules("enlève le chat").params["refer_type"] == "base"
    assert _rules("génère le plan suivant").params["refer_type"] == "feature"


def test_luma_strength_follows_intent():
    assert _rules("enlève le chat", "luma").params["strength"] == "adhere"
    assert _rules("mets un style anime", "luma").params["strength"] == "flex"


def test_is_engineered():
    assert prompting.is_engineered("Remove the cat from <<<video_1>>>.")
    assert not prompting.is_engineered("enlève le chat")


def test_as_dict_is_serializable():
    payload = prompting.as_dict(_rules("ajoute un chat"))
    assert set(payload) >= {
        "original",
        "enhanced",
        "intent",
        "model",
        "keep",
        "tips",
        "source",
        "steps",
        "params",
        "negative_prompt",
    }


# --- Mode LLM ---


def test_enhance_uses_rules_without_llm():
    result = asyncio.run(prompting.enhance("ajoute un chat", "kling", use_llm=False))
    assert result.source == "rules"


def test_enhance_with_llm_uses_provider_and_enforces_reference(monkeypatch):
    provider = FakeTextProvider()
    monkeypatch.setattr(llm, "get_router", lambda: llm.Router([provider]))
    result = asyncio.run(prompting.enhance("enlève le mec", "kling", use_llm=True))
    assert result.source == "llm:fake"
    assert result.enhanced == "Remove the man from <<<video_1>>>."
    system = provider.requests[0].options["system"]
    assert "<<<video_1>>>" in system


def test_enhance_with_llm_parses_fenced_json_and_steps(monkeypatch):
    answer = (
        '```json\n{"prompts": ["A <<<video_1>>>", "B <<<video_1>>>"], "negative_prompt": "x"}\n```'
    )
    monkeypatch.setattr(llm, "get_router", lambda: llm.Router([FakeTextProvider(answer)]))
    result = asyncio.run(prompting.enhance("enlève le chat et ajoute un chien", use_llm=True))
    assert [step.prompt for step in result.steps] == ["A <<<video_1>>>", "B <<<video_1>>>"]
    assert result.negative_prompt == "x"


def test_enhance_with_llm_accepts_plain_text(monkeypatch):
    plain = FakeTextProvider("Replace the sky of the video with a storm.")
    monkeypatch.setattr(llm, "get_router", lambda: llm.Router([plain]))
    result = asyncio.run(prompting.enhance("mets un orage", "kling", use_llm=True))
    assert result.enhanced == "Replace the sky of <<<video_1>>> with a storm."


def test_enhance_with_llm_falls_back_on_failure(monkeypatch):
    monkeypatch.setattr(llm, "get_router", lambda: llm.Router([FailingProvider()]))
    result = asyncio.run(prompting.enhance("ajoute un chat", "kling", use_llm=True))
    assert result.source == "rules"


def test_enhance_with_llm_falls_back_on_empty_answer(monkeypatch):
    monkeypatch.setattr(llm, "get_router", lambda: llm.Router([FakeTextProvider("   ")]))
    result = asyncio.run(prompting.enhance("ajoute un chat", "kling", use_llm=True))
    assert result.source == "rules"
