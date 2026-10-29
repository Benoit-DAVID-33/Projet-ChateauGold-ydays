"""Tests du module d'envoi d'email."""

import asyncio

import pytest

from server import mailer


def test_send_contact_email_raises_mail_error(monkeypatch):
    def boom(*args, **kwargs):
        raise OSError("smtp down")

    monkeypatch.setattr(mailer, "_send_sync", boom)
    with pytest.raises(mailer.MailError):
        asyncio.run(mailer.send_contact_email("Alice", "alice@example.com", "Bonjour"))


def test_send_contact_email_success(monkeypatch):
    sent = {}

    def capture(recipient, subject, body, reply_to=None):
        sent["recipient"] = recipient
        sent["subject"] = subject
        sent["reply_to"] = reply_to

    monkeypatch.setattr(mailer, "_send_sync", capture)
    asyncio.run(mailer.send_contact_email("Alice", "alice@example.com", "Bonjour"))
    assert "Alice" in sent["subject"]
    assert sent["reply_to"] == "alice@example.com"
