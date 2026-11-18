"""Erreurs métier.

Les services lèvent ces exceptions ; la couche API les traduit en réponses HTTP
(voir ``goldfx.api.errors``). Le domaine ignore donc tout du protocole HTTP.
"""


class DomainError(Exception):
    """Racine de toutes les erreurs métier."""

    code = "domain_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    code = "not_found"


class AuthenticationError(DomainError):
    code = "authentication_failed"


class ConflictError(DomainError):
    code = "conflict"


class ValidationError(DomainError):
    code = "validation_error"


class PayloadTooLargeError(DomainError):
    code = "payload_too_large"


class UnsupportedMediaTypeError(DomainError):
    code = "unsupported_media_type"


class RateLimitedError(DomainError):
    code = "rate_limited"


class ConfigurationError(DomainError):
    """Une fonctionnalité est appelée alors que sa configuration manque."""

    code = "not_configured"


class ExternalServiceError(DomainError):
    """Un service tiers (Kling, traitement, SMTP, ffmpeg...) a échoué."""

    code = "external_service_error"

    def __init__(self, service: str, message: str) -> None:
        super().__init__(message)
        self.service = service
