"""Envoi d'emails via SMTP (stdlib smtplib) execute dans un thread.

smtplib est bloquant : on l'execute hors de la boucle d'evenements avec
run_in_threadpool pour ne pas bloquer les autres requetes.
"""

import logging
import smtplib
from email.message import EmailMessage

from starlette.concurrency import run_in_threadpool

from . import config

logger = logging.getLogger("goldfx")


class MailError(Exception):
    """Echec de l'envoi d'un email."""


def _send_sync(recipient: str, subject: str, body: str, reply_to: str | None = None) -> None:
    """Envoi SMTP bloquant (execute dans un thread)."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.MAIL_DEFAULT_SENDER
    message["To"] = recipient
    if reply_to:
        message["Reply-To"] = reply_to
    message.set_content(body)

    with smtplib.SMTP(config.MAIL_SERVER, config.MAIL_PORT, timeout=30) as server:
        if config.MAIL_USE_TLS:
            server.starttls()
        if config.MAIL_USERNAME:
            server.login(config.MAIL_USERNAME, config.MAIL_PASSWORD)
        server.send_message(message)


async def send_contact_email(name: str, email: str, message: str) -> None:
    """Envoie le message du formulaire de contact, en levant MailError si besoin."""
    subject = f"Message de contact depuis Château Gold - {name}"
    body = f"Nom: {name}\nEmail: {email}\n\nMessage:\n{message}\n"
    try:
        await run_in_threadpool(_send_sync, config.CONTACT_RECIPIENT, subject, body, email)
    except (OSError, smtplib.SMTPException) as exc:
        raise MailError(str(exc)) from exc
