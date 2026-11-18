from __future__ import annotations

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr

from goldfx.domain.errors import ExternalServiceError
from goldfx.domain.ports import EmailMessage

logger = logging.getLogger(__name__)


class ConsoleMailer:
    """Journalise les emails au lieu de les envoyer (développement)."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)
        logger.info("mail.console to=%s subject=%s\n%s", message.to, message.subject, message.body)


@dataclass(frozen=True, slots=True)
class SmtpConfig:
    host: str
    port: int
    username: str
    password: str
    starttls: bool
    use_ssl: bool
    sender: str


class SmtpMailer:
    def __init__(self, config: SmtpConfig) -> None:
        self._cfg = config

    def send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        mime["From"] = formataddr(("GOLD FX", self._cfg.sender))
        mime["To"] = message.to
        mime["Subject"] = message.subject
        if message.reply_to:
            mime["Reply-To"] = message.reply_to
        mime.set_content(message.body)

        context = ssl.create_default_context()
        try:
            if self._cfg.use_ssl:
                server: smtplib.SMTP = smtplib.SMTP_SSL(
                    self._cfg.host, self._cfg.port, context=context, timeout=20
                )
            else:
                server = smtplib.SMTP(self._cfg.host, self._cfg.port, timeout=20)
            with server:
                if self._cfg.starttls and not self._cfg.use_ssl:
                    server.starttls(context=context)
                if self._cfg.username:
                    server.login(self._cfg.username, self._cfg.password)
                server.send_message(mime)
        except (OSError, smtplib.SMTPException) as exc:
            logger.warning("mail.smtp_failed error=%s", exc)
            raise ExternalServiceError("smtp", "L'envoi de l'email a échoué") from exc
