"""Tests unitaires des utilitaires (templating, forms, http)."""

import asyncio
from types import SimpleNamespace

from starlette.datastructures import FormData

from server import forms, templating
from server.http import LazyClient


def test_flash_roundtrip():
    request = SimpleNamespace(session={})
    templating.flash(request, "bonjour", "success")
    messages = templating.get_flashed_messages(request, with_categories=True)
    assert messages == [["success", "bonjour"]]
    assert templating.get_flashed_messages(request) == []


def test_flash_category_filter():
    request = SimpleNamespace(session={})
    templating.flash(request, "erreur", "error")
    templating.flash(request, "info", "message")
    assert templating.get_flashed_messages(request, category_filter=("error",)) == ["erreur"]


def test_form_str():
    form = FormData({"name": "alice"})
    assert forms.form_str(form, "name") == "alice"
    assert forms.form_str(form, "absent") == ""
    assert forms.form_str(form, "absent", default="defaut") == "defaut"


def test_lazy_client_reuse_and_close():
    lazy = LazyClient("http://example.test", timeout=5.0, retries=1)
    first = lazy.get()
    assert lazy.get() is first
    asyncio.run(lazy.aclose())
    assert lazy.get() is not first
    asyncio.run(lazy.aclose())
