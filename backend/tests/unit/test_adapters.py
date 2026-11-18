from __future__ import annotations

import io
import smtplib
from pathlib import Path
from typing import Any, ClassVar

import httpx
import pytest
import respx

from goldfx.domain.errors import ExternalServiceError
from goldfx.domain.ports import EmailMessage
from goldfx.infrastructure.mail.mailers import SmtpConfig, SmtpMailer
from goldfx.infrastructure.processing.processors import EchoMediaProcessor, HttpMediaProcessor
from goldfx.infrastructure.transcoding.ffmpeg import FfmpegTranscoder
from goldfx.logging_setup import JsonFormatter, configure_logging

from ..fakes import FrozenClock

URL = "http://processor.test"


class TestHttpProcessor:
    @respx.mock
    def test_process_media_contract(self) -> None:
        route = respx.post(f"{URL}/process-video").mock(
            return_value=httpx.Response(200, content=b"OUT", headers={"content-type": "image/png"})
        )
        out = HttpMediaProcessor(URL, 5, FrozenClock()).process_media(
            io.BytesIO(b"IN"), "a.png", "image/png", "plus doré"
        )
        assert (out.data, out.content_type) == (b"OUT", "image/png")
        body = route.calls.last.request.content
        assert b'name="query"' in body and b"plus dor" in body and b'filename="a.png"' in body

    @respx.mock
    def test_process_query_contract(self) -> None:
        respx.post(f"{URL}/process-query").mock(
            return_value=httpx.Response(
                200, json={"response": "ok", "timestamp": "2026-10-30T10:00:00+00:00"}
            )
        )
        answer = HttpMediaProcessor(URL, 5, FrozenClock()).process_query("bonjour")
        assert answer.response == "ok" and answer.timestamp.year == 2026

    @respx.mock
    @pytest.mark.parametrize("path", ["/process-video", "/process-query"])
    def test_errors(self, path: str) -> None:
        respx.post(f"{URL}{path}").mock(return_value=httpx.Response(500))
        processor = HttpMediaProcessor(URL, 5, FrozenClock())
        with pytest.raises(ExternalServiceError):
            if path == "/process-video":
                processor.process_media(io.BytesIO(b"x"), "a", "image/png", "")
            else:
                processor.process_query("x")
        respx.post(f"{URL}{path}").mock(side_effect=httpx.ConnectError("down"))
        with pytest.raises(ExternalServiceError, match="joindre"):
            if path == "/process-video":
                processor.process_media(io.BytesIO(b"x"), "a", "image/png", "")
            else:
                processor.process_query("x")

    def test_echo(self) -> None:
        echo = EchoMediaProcessor(FrozenClock())
        assert echo.process_media(io.BytesIO(b"abc"), "a", "image/png", "q").data == b"abc"
        assert "salut" in echo.process_query("salut").response


class _FakeSmtp:
    instances: ClassVar[list[_FakeSmtp]] = []

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.calls: list[str] = []
        self.message: Any = None
        _FakeSmtp.instances.append(self)

    def __enter__(self) -> _FakeSmtp:
        return self

    def __exit__(self, *exc: object) -> None:
        self.calls.append("quit")

    def starttls(self, context: object) -> None:
        self.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.calls.append(f"login:{user}")

    def send_message(self, message: Any) -> None:
        self.message = message


def test_smtp_mailer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(smtplib, "SMTP", _FakeSmtp)
    config = SmtpConfig("smtp.test", 587, "user", "pw", True, False, "noreply@goldfx.test")
    SmtpMailer(config).send(EmailMessage("to@ex.com", "Sujet", "Corps", reply_to="r@ex.com"))
    smtp = _FakeSmtp.instances[-1]
    assert smtp.calls == ["starttls", "login:user", "quit"]
    assert smtp.message["Reply-To"] == "r@ex.com" and smtp.message["To"] == "to@ex.com"

    def boom(*args: Any, **kwargs: Any) -> None:
        raise OSError("refused")

    monkeypatch.setattr(smtplib, "SMTP", boom)
    with pytest.raises(ExternalServiceError):
        SmtpMailer(config).send(EmailMessage("to@ex.com", "s", "b"))


def test_ffmpeg_errors(tmp_path: Path) -> None:
    with pytest.raises(ExternalServiceError, match="pas installé"):
        FfmpegTranscoder("/nonexistent/ffmpeg", 5).to_mp4(tmp_path / "a", tmp_path / "b")
    bad = tmp_path / "bad.webm"
    bad.write_bytes(b"\x1a\x45\xdf\xa3garbage")
    with pytest.raises(ExternalServiceError, match="échoué"):
        FfmpegTranscoder("ffmpeg", 30).to_mp4(bad, tmp_path / "out.mp4")


def test_json_logging(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO", as_json=True)
    import logging

    logging.getLogger("t").info("bonjour")
    assert '"msg": "bonjour"' in capsys.readouterr().out
    assert isinstance(logging.getLogger().handlers[0].formatter, JsonFormatter)
