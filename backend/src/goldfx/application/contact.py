"""Formulaire de contact."""

from __future__ import annotations

from goldfx.domain.errors import ConfigurationError, ValidationError
from goldfx.domain.models import User
from goldfx.domain.ports import EmailMessage, Mailer

MAX_MESSAGE_LENGTH = 5000


class ContactService:
    def __init__(self, mailer: Mailer, recipient: str) -> None:
        self._mailer = mailer
        self._recipient = recipient

    def send(self, sender: User, name: str, email: str, message: str) -> None:
        name, email, message = name.strip(), email.strip(), message.strip()
        if not (name and email and message):
            raise ValidationError("Veuillez remplir tous les champs.")
        if len(message) > MAX_MESSAGE_LENGTH or len(name) > 200:
            raise ValidationError("Message trop long")
        if not self._recipient:
            raise ConfigurationError("Aucun destinataire de contact n'est configuré")
        # Le nom saisi ne doit pas pouvoir injecter d'en-têtes dans le sujet.
        safe_name = " ".join(name.split())
        body = (
            f"Nom : {name}\n"
            f"Email : {email}\n"
            f"Compte : {sender.username} <{sender.email}>\n\n"
            f"Message :\n{message}\n"
        )
        self._mailer.send(
            EmailMessage(
                to=self._recipient,
                subject=f"Message de contact depuis GOLD FX - {safe_name}",
                body=body,
                reply_to=email,
            )
        )
