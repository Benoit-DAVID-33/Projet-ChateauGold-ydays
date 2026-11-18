"""Tests des cas d'usage avec de vraies implémentations SQL (SQLite) et des fakes."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from werkzeug.security import generate_password_hash

from goldfx.application.generation import GenerationInput
from goldfx.config import Environment, Settings
from goldfx.container import Container
from goldfx.domain.errors import (
    AuthenticationError,
    ConfigurationError,
    ConflictError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from goldfx.domain.models import GenerationKind, GenerationStatus, MediaSource, User
from goldfx.domain.ports import EmailMessage, UnitOfWork

from ..fakes import FakeGenerationProvider, FrozenClock, png_bytes


def _register(container: Container, name: str = "bob") -> User:
    with container.unit_of_work() as uow:
        return container.auth_service(uow).register(name, f"{name}@ex.com", "motdepasse")


@pytest.fixture
def uow(container: Container) -> Iterator[UnitOfWork]:
    with container.unit_of_work() as unit:
        yield unit


class TestAuthService:
    def test_register_validations(self, uow: UnitOfWork, container: Container) -> None:
        auth = container.auth_service(uow)
        with pytest.raises(ValidationError):
            auth.register("a", "a@ex.com", "motdepasse")
        with pytest.raises(ValidationError):
            auth.register("valid", "pas-un-email", "motdepasse")
        with pytest.raises(ValidationError):
            auth.register("valid", "v@ex.com", "court")
        auth.register("Valid", "v@ex.com", "motdepasse")
        with pytest.raises(ConflictError):
            auth.register("valid", "autre@ex.com", "motdepasse")
        with pytest.raises(ConflictError):
            auth.register("autre", "V@EX.com", "motdepasse")

    def test_session_expiry(
        self, uow: UnitOfWork, container: Container, clock: FrozenClock
    ) -> None:
        _register(container)
        auth = container.auth_service(uow)
        result = auth.login("bob", "motdepasse", "ip")
        assert auth.resolve(result.token).username == "bob"
        clock.advance(hours=container.settings.session_ttl_hours + 1)
        with pytest.raises(AuthenticationError, match="expirée"):
            auth.resolve(result.token)

    def test_login_rate_limited(self, uow: UnitOfWork, container: Container) -> None:
        _register(container)
        auth = container.auth_service(uow)
        for _ in range(container.settings.login_max_attempts):
            with pytest.raises(AuthenticationError):
                auth.login("bob", "faux", "ip")
        with pytest.raises(RateLimitedError):
            auth.login("bob", "motdepasse", "ip")

    def test_legacy_hash_is_upgraded_on_login(self, uow: UnitOfWork, container: Container) -> None:
        legacy = User(
            id=__import__("uuid").uuid4(),
            username="Ricardo",
            email="r@ex.com",
            password_hash=generate_password_hash("ancien"),
            created_at=container.clock.now(),
        )
        uow.users.add(legacy)
        uow.commit()
        container.auth_service(uow).login("ricardo", "ancien", "ip")
        stored = uow.users.get(legacy.id)
        assert stored is not None and stored.password_hash.startswith("$argon2id$")


class TestGenerationService:
    def test_validation(self, uow: UnitOfWork, container: Container) -> None:
        user = _register(container)
        service = container.generation_service(uow)
        bad = [
            GenerationInput(GenerationKind.TEXT_TO_IMAGE, prompt=" "),
            GenerationInput(GenerationKind.TEXT_TO_IMAGE, prompt="x", aspect_ratio="7:3"),
            GenerationInput(GenerationKind.TEXT_TO_VIDEO, prompt="x", duration="7"),
            GenerationInput(GenerationKind.TEXT_TO_VIDEO, prompt="x", mode="ultra"),
            GenerationInput(GenerationKind.OMNI_VIDEO, prompt="x", refer_type="autre"),
            GenerationInput(GenerationKind.TEXT_TO_IMAGE, prompt="x", count=10),
            GenerationInput(GenerationKind.IMAGE_TO_VIDEO),
            GenerationInput(GenerationKind.TEXT_TO_IMAGE, prompt="x" * 3000),
        ]
        for data in bad:
            with pytest.raises(ValidationError):
                service.create(user.id, data)

    def test_image_to_video_sends_base64_and_imports_results_once(
        self, uow: UnitOfWork, container: Container, provider: FakeGenerationProvider
    ) -> None:
        user = _register(container)
        media = container.media_service(uow)
        image = media.add_derived(user.id, png_bytes(), "src.png", MediaSource.UPLOAD)
        service = container.generation_service(uow)
        gen = service.create(
            user.id, GenerationInput(GenerationKind.IMAGE_TO_VIDEO, source_media_id=image.id)
        )
        assert provider.submitted[0].image_base64
        assert service.refresh(user.id, gen.id).status is GenerationStatus.PROCESSING
        done = service.refresh(user.id, gen.id)
        assert done.status is GenerationStatus.SUCCEEDED and len(done.result_media_ids) == 1
        again = service.refresh(user.id, gen.id)
        assert again.result_media_ids == done.result_media_ids and provider.downloads == 1
        result = media.get(user.id, done.result_media_ids[0])
        assert result.source is MediaSource.GENERATED and result.parent_id == image.id

    def test_failed_generation_keeps_message(
        self, uow: UnitOfWork, container: Container, provider: FakeGenerationProvider
    ) -> None:
        provider.fail_task = True
        user = _register(container)
        service = container.generation_service(uow)
        gen = service.create(user.id, GenerationInput(GenerationKind.TEXT_TO_VIDEO, prompt="x"))
        service.refresh(user.id, gen.id)
        failed = service.refresh(user.id, gen.id)
        assert failed.status is GenerationStatus.FAILED and failed.error_message == "NSFW refusé"

    def test_omni_video_requires_public_url_and_video_source(
        self, uow: UnitOfWork, container: Container, settings: Settings
    ) -> None:
        user = _register(container)
        image = container.media_service(uow).add_derived(
            user.id, png_bytes(), "a.png", MediaSource.UPLOAD
        )
        service = container.generation_service(uow)
        with pytest.raises(ValidationError, match="vidéo"):
            service.create(
                user.id,
                GenerationInput(GenerationKind.OMNI_VIDEO, prompt="x", source_media_id=image.id),
            )
        settings.public_base_url = ""
        from ..fakes import MP4_BYTES

        video = container.media_service(uow).add_derived(
            user.id, MP4_BYTES, "v.mp4", MediaSource.UPLOAD
        )
        with pytest.raises(ConfigurationError, match="PUBLIC_BASE_URL"):
            container.generation_service(uow).create(
                user.id,
                GenerationInput(GenerationKind.OMNI_VIDEO, prompt="x", source_media_id=video.id),
            )

    def test_other_users_generation_is_hidden(self, uow: UnitOfWork, container: Container) -> None:
        alice, bob = _register(container, "alice"), _register(container, "bob")
        service = container.generation_service(uow)
        gen = service.create(alice.id, GenerationInput(GenerationKind.TEXT_TO_IMAGE, prompt="x"))
        with pytest.raises(NotFoundError):
            service.refresh(bob.id, gen.id)


class TestContactService:
    def test_subject_cannot_inject_headers(self, uow: UnitOfWork, container: Container) -> None:
        user = _register(container)
        container.contact_service().send(user, "Eve\r\nBcc: x@evil", "e@ex.com", "Bonjour")
        sent: EmailMessage = container.mailer.sent[-1]  # type: ignore[attr-defined]
        assert "\n" not in sent.subject and "\r" not in sent.subject
        assert sent.reply_to == "e@ex.com" and sent.to == container.settings.contact_recipient

    def test_requires_fields_and_recipient(self, uow: UnitOfWork, container: Container) -> None:
        user = _register(container)
        with pytest.raises(ValidationError):
            container.contact_service().send(user, "", "e@ex.com", "x")
        container.settings.contact_recipient = ""
        with pytest.raises(ConfigurationError):
            container.contact_service().send(user, "n", "e@ex.com", "x")


class TestSettings:
    def test_production_refuses_insecure_configuration(self) -> None:
        with pytest.raises(ValueError, match="SECRET_KEY"):
            Settings(environment=Environment.PRODUCTION, secret_key="court", _env_file=None)
        with pytest.raises(ValueError, match="COOKIE_SECURE"):
            Settings(
                environment=Environment.PRODUCTION,
                secret_key="x" * 40,
                cookie_secure=False,
                _env_file=None,
            )
        with pytest.raises(ValueError, match="CONTACT_RECIPIENT"):
            Settings(environment=Environment.PRODUCTION, secret_key="x" * 40, _env_file=None)
        ok = Settings(
            environment=Environment.PRODUCTION,
            secret_key="x" * 40,
            contact_recipient="contact@goldfx.test",
            _env_file=None,
        )
        assert ok.is_production and not ok.kling_configured
