"""Composition root : le SEUL endroit qui connaît les implémentations concrètes.

Les singletons (moteur SQL, clients HTTP, stockage…) sont créés une fois au
démarrage ; les services, eux, sont construits par requête autour d'une unité
de travail (transaction) dédiée.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import Engine
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.orm import sessionmaker

from goldfx.application.auth import AuthPolicy, AuthService
from goldfx.application.contact import ContactService
from goldfx.application.generation import GenerationService, PublicLinkConfig
from goldfx.application.media import MediaLimits, MediaService
from goldfx.application.processing import ProcessingService
from goldfx.application.transcoding import TranscodingService
from goldfx.application.workflows import WorkflowService
from goldfx.config import MailBackend, ProcessorBackend, Settings
from goldfx.domain.ports import (
    Clock,
    FileStorage,
    GenerationProvider,
    Mailer,
    MediaProcessor,
    MediaTypeDetector,
    PasswordHasher,
    RateLimiter,
    UnitOfWork,
    UrlSigner,
    VideoTranscoder,
)
from goldfx.infrastructure.clock import SystemClock
from goldfx.infrastructure.db.engine import build_engine, build_session_factory
from goldfx.infrastructure.db.repositories import SqlUnitOfWork
from goldfx.infrastructure.kling.client import KlingClient, KlingConfig
from goldfx.infrastructure.mail.mailers import ConsoleMailer, SmtpConfig, SmtpMailer
from goldfx.infrastructure.processing.processors import EchoMediaProcessor, HttpMediaProcessor
from goldfx.infrastructure.security.passwords import Argon2PasswordHasher
from goldfx.infrastructure.security.rate_limit import InMemoryRateLimiter
from goldfx.infrastructure.security.signing import HmacUrlSigner
from goldfx.infrastructure.storage.detection import MagicBytesDetector
from goldfx.infrastructure.storage.local import LocalFileStorage
from goldfx.infrastructure.transcoding.ffmpeg import FfmpegTranscoder


@dataclass
class Container:
    settings: Settings
    engine: Engine
    session_factory: sessionmaker[OrmSession]
    clock: Clock
    hasher: PasswordHasher
    login_limiter: RateLimiter
    signer: UrlSigner
    storage: FileStorage
    detector: MediaTypeDetector
    generation_provider: GenerationProvider
    processor: MediaProcessor
    transcoder: VideoTranscoder
    mailer: Mailer
    transcoding_slots: threading.BoundedSemaphore

    # ------------------------------------------------------------------ #
    # Fabriques de services (une unité de travail par requête)
    # ------------------------------------------------------------------ #
    def auth_service(self, uow: UnitOfWork) -> AuthService:
        return AuthService(
            uow,
            self.hasher,
            self.clock,
            self.login_limiter,
            AuthPolicy(
                password_min_length=self.settings.password_min_length,
                session_ttl=timedelta(hours=self.settings.session_ttl_hours),
            ),
        )

    def media_service(self, uow: UnitOfWork) -> MediaService:
        return MediaService(
            uow,
            self.storage,
            self.detector,
            self.clock,
            MediaLimits(
                max_image_bytes=self.settings.max_image_bytes,
                max_video_bytes=self.settings.max_video_bytes,
            ),
        )

    def processing_service(self, uow: UnitOfWork) -> ProcessingService:
        return ProcessingService(self.media_service(uow), self.processor)

    def generation_service(self, uow: UnitOfWork) -> GenerationService:
        return GenerationService(
            uow,
            self.generation_provider,
            self.media_service(uow),
            self.signer,
            self.clock,
            PublicLinkConfig(
                base_url=self.settings.public_base_url,
                ttl=timedelta(seconds=self.settings.signed_url_ttl_seconds),
            ),
            max_result_bytes=self.settings.max_video_bytes,
            max_age=timedelta(hours=self.settings.generation_max_age_hours),
        )

    def transcoding_service(self, uow: UnitOfWork) -> TranscodingService:
        return TranscodingService(
            self.transcoder,
            self.media_service(uow),
            max_bytes=self.settings.max_video_bytes,
            slots=self.transcoding_slots,
        )

    def workflow_service(self, uow: UnitOfWork) -> WorkflowService:
        return WorkflowService(uow, self.clock)

    def contact_service(self) -> ContactService:
        return ContactService(self.mailer, self.settings.contact_recipient)

    def new_unit_of_work(self) -> tuple[SqlUnitOfWork, OrmSession]:
        session = self.session_factory()
        return SqlUnitOfWork(session), session

    @contextmanager
    def unit_of_work(self) -> Iterator[SqlUnitOfWork]:
        """Unité de travail hors requête HTTP (CLI, scripts, tests) ; la session
        est toujours fermée, et annulée en cas d'erreur."""
        uow, session = self.new_unit_of_work()
        try:
            yield uow
        except BaseException:
            session.rollback()
            raise
        finally:
            session.close()


def build_container(settings: Settings) -> Container:
    clock = SystemClock()
    engine = build_engine(settings.database_url)

    processor: MediaProcessor
    if settings.processor_backend is ProcessorBackend.HTTP:
        processor = HttpMediaProcessor(
            settings.processor_url, settings.processor_timeout_seconds, clock
        )
    else:
        processor = EchoMediaProcessor(clock)

    mailer: Mailer
    if settings.mail_backend is MailBackend.SMTP:
        mailer = SmtpMailer(
            SmtpConfig(
                host=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username,
                password=settings.smtp_password.get_secret_value(),
                starttls=settings.smtp_starttls,
                use_ssl=settings.smtp_ssl,
                sender=settings.mail_from,
            )
        )
    else:
        mailer = ConsoleMailer()

    return Container(
        settings=settings,
        engine=engine,
        session_factory=build_session_factory(engine),
        clock=clock,
        hasher=Argon2PasswordHasher(),
        login_limiter=InMemoryRateLimiter(
            settings.login_max_attempts, settings.login_window_seconds
        ),
        signer=HmacUrlSigner(settings.effective_secret_key()),
        storage=LocalFileStorage(settings.storage_dir),
        detector=MagicBytesDetector(),
        generation_provider=KlingClient(
            KlingConfig(
                base_url=settings.kling_base_url,
                access_key=settings.kling_access_key.get_secret_value(),
                secret_key=settings.kling_secret_key.get_secret_value(),
                image_model=settings.kling_image_model,
                video_model=settings.kling_video_model,
                omni_model=settings.kling_omni_model,
                timeout_seconds=settings.kling_timeout_seconds,
                download_timeout_seconds=settings.kling_download_timeout_seconds,
            )
        ),
        processor=processor,
        transcoder=FfmpegTranscoder(settings.ffmpeg_binary, settings.ffmpeg_timeout_seconds),
        mailer=mailer,
        transcoding_slots=threading.BoundedSemaphore(settings.ffmpeg_max_concurrency),
    )
