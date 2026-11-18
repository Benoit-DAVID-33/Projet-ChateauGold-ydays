"""Configuration typée, chargée depuis l'environnement (12-factor).

Toutes les variables sont préfixées ``GOLDFX_``. Voir ``.env.example`` à la
racine du dépôt pour la liste documentée.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_SECRETS = {"", "change-me", "changeme", "dev-secret-key-change-in-production"}


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class ProcessorBackend(StrEnum):
    ECHO = "echo"  # traitement factice intégré (comportement historique)
    HTTP = "http"  # API externe (contrat /process-video & /process-query)


class MailBackend(StrEnum):
    CONSOLE = "console"  # journalise l'email (dev)
    SMTP = "smtp"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GOLDFX_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Application -------------------------------------------------------- #
    environment: Environment = Environment.DEVELOPMENT
    secret_key: SecretStr = SecretStr("")
    log_level: str = "INFO"
    log_json: bool = False
    # URL publique de l'application (sert à construire les liens signés que
    # Kling télécharge pour Omni-Video). Ex. https://goldfx.example.com
    public_base_url: str = ""
    # Origines autorisées pour le CORS (inutile si front et API partagent le domaine).
    cors_origins: list[str] = Field(default_factory=list)

    # --- Base de données ---------------------------------------------------- #
    database_url: str = "sqlite:///./data/goldfx.db"

    # --- Sessions / sécurité ------------------------------------------------ #
    session_ttl_hours: int = 24 * 7
    cookie_secure: bool = True
    password_min_length: int = 8
    login_max_attempts: int = 10
    login_window_seconds: int = 300
    signed_url_ttl_seconds: int = 3600

    # --- Stockage ----------------------------------------------------------- #
    storage_dir: Path = Path("./data/media")
    max_image_mb: int = 25
    max_video_mb: int = 500

    # --- Traitement externe ------------------------------------------------- #
    processor_backend: ProcessorBackend = ProcessorBackend.ECHO
    processor_url: str = "http://processor:5001"
    processor_timeout_seconds: float = 300.0

    # --- Kling AI ------------------------------------------------------------ #
    kling_base_url: str = "https://api.klingai.com"
    kling_access_key: SecretStr = SecretStr("")
    kling_secret_key: SecretStr = SecretStr("")
    kling_image_model: str = "kling-v1"
    kling_video_model: str = "kling-v1"
    kling_omni_model: str = "kling-video-o1"
    kling_timeout_seconds: float = 60.0
    kling_download_timeout_seconds: float = 300.0
    # Suivi côté serveur des générations non terminées (0 : désactivé).
    generation_sweep_seconds: int = Field(default=30, ge=0)
    # Au-delà, une génération toujours en cours est déclarée en échec.
    generation_max_age_hours: int = Field(default=24, ge=1)

    # --- Conversion vidéo ---------------------------------------------------- #
    ffmpeg_binary: str = "ffmpeg"
    ffmpeg_timeout_seconds: int = 600
    ffmpeg_max_concurrency: int = 2

    # --- Email / contact ----------------------------------------------------- #
    mail_backend: MailBackend = MailBackend.CONSOLE
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    mail_from: str = "noreply@goldfx.local"
    contact_recipient: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment is Environment.PRODUCTION

    @property
    def kling_configured(self) -> bool:
        return bool(
            self.kling_access_key.get_secret_value() and self.kling_secret_key.get_secret_value()
        )

    @property
    def max_image_bytes(self) -> int:
        return self.max_image_mb * 1024 * 1024

    @property
    def max_video_bytes(self) -> int:
        return self.max_video_mb * 1024 * 1024

    @model_validator(mode="after")
    def _check_production_safety(self) -> Self:
        """Refuse de démarrer en production avec une configuration dangereuse."""
        if not self.is_production:
            return self
        problems: list[str] = []
        secret = self.secret_key.get_secret_value()
        if secret in _INSECURE_SECRETS or len(secret) < 32:
            problems.append("GOLDFX_SECRET_KEY doit faire au moins 32 caractères aléatoires")
        if not self.cookie_secure:
            problems.append("GOLDFX_COOKIE_SECURE doit valoir true en production")
        if not self.contact_recipient:
            problems.append("GOLDFX_CONTACT_RECIPIENT est requis (formulaire de contact)")
        if problems:
            raise ValueError("Configuration de production invalide : " + " ; ".join(problems))
        return self

    def effective_secret_key(self) -> str:
        """Clé utilisée pour signer. En dev/test, une clé fixe évite d'invalider
        les sessions à chaque redémarrage ; en production la clé est obligatoire."""
        secret = self.secret_key.get_secret_value()
        if secret:
            return secret
        return "insecure-development-key-do-not-use-in-production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
