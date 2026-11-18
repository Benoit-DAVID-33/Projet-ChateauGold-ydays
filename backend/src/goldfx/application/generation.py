"""Génération IA (Kling) : texte vers image, texte vers vidéo, image vers vidéo, Omni-Video.

Le cycle de vie d'une génération est persisté : l'utilisateur retrouve son
historique et les résultats sont rapatriés une seule fois dans sa bibliothèque
(les URLs de Kling expirent).

Le suivi passe par ``refresh`` : à la demande de l'utilisateur (route de suivi) ou
par la tâche de fond (``refresh_pending``). Un bail en base garantit qu'un seul
processus interroge le fournisseur et rapatrie les résultats d'une génération.
"""

from __future__ import annotations

import base64
import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import timedelta
from uuid import UUID

from goldfx.domain.errors import ConfigurationError, ValidationError
from goldfx.domain.models import (
    Generation,
    GenerationKind,
    GenerationStatus,
    MediaKind,
    MediaSource,
)
from goldfx.domain.ports import (
    Clock,
    GenerationProvider,
    GenerationRequest,
    ProviderHealth,
    UnitOfWork,
    UrlSigner,
)

from .media import MediaService

logger = logging.getLogger(__name__)

ASPECT_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"}
DURATIONS = {"5", "10"}
MODES = {"std", "pro"}
REFER_TYPES = {"base", "feature"}
MAX_PROMPT_LENGTH = 2500
KLING_MAX_IMAGE_BYTES = 10 * 1024 * 1024
# Durée du bail de suivi : couvre l'interrogation du fournisseur et le
# téléchargement des résultats ; libéré dès la fin, il expire seul en cas de panne.
REFRESH_LEASE = timedelta(minutes=15)


@dataclass(frozen=True, slots=True)
class GenerationInput:
    kind: GenerationKind
    prompt: str = ""
    negative_prompt: str = ""
    aspect_ratio: str | None = None
    duration: str = "5"
    mode: str = "std"
    count: int = 1
    source_media_id: UUID | None = None
    refer_type: str = "base"
    keep_original_sound: bool = True


@dataclass(frozen=True, slots=True)
class PublicLinkConfig:
    base_url: str
    ttl: timedelta


class GenerationService:
    def __init__(
        self,
        uow: UnitOfWork,
        provider: GenerationProvider,
        media: MediaService,
        signer: UrlSigner,
        clock: Clock,
        public_links: PublicLinkConfig,
        max_result_bytes: int,
        max_age: timedelta = timedelta(hours=24),
    ) -> None:
        self._uow = uow
        self._provider = provider
        self._media = media
        self._signer = signer
        self._clock = clock
        self._links = public_links
        self._max_result_bytes = max_result_bytes
        self._max_age = max_age

    # ------------------------------------------------------------------ #
    def create(self, owner_id: UUID, data: GenerationInput) -> Generation:
        self._validate(data)
        request = self._build_request(owner_id, data)
        task_id = self._provider.submit(request)
        now = self._clock.now()
        generation = Generation(
            id=uuid.uuid4(),
            owner_id=owner_id,
            kind=data.kind,
            status=GenerationStatus.SUBMITTED,
            prompt=data.prompt.strip(),
            parameters={
                "negative_prompt": data.negative_prompt,
                "aspect_ratio": data.aspect_ratio,
                "duration": data.duration,
                "mode": data.mode,
                "count": data.count,
                "refer_type": data.refer_type,
                "keep_original_sound": data.keep_original_sound,
            },
            provider_task_id=task_id,
            created_at=now,
            updated_at=now,
            source_media_id=data.source_media_id,
        )
        self._uow.generations.add(generation)
        self._uow.commit()
        logger.info("generation.submitted id=%s kind=%s", generation.id, generation.kind)
        return generation

    def get(self, owner_id: UUID, generation_id: UUID) -> Generation:
        generation = self._uow.generations.get(generation_id)
        if generation is None or generation.owner_id != owner_id:
            from goldfx.domain.errors import NotFoundError

            raise NotFoundError("Génération introuvable")
        return generation

    def refresh(self, owner_id: UUID, generation_id: UUID) -> Generation:
        """Interroge le fournisseur si la tâche n'est pas terminée ; rapatrie les
        résultats dans la bibliothèque à la réussite (une seule fois)."""
        return self._refresh(self.get(owner_id, generation_id))

    def refresh_pending(self, limit: int = 20) -> int:
        """Suivi de fond : met à jour les générations non terminées de tous les
        utilisateurs. Une erreur sur l'une n'empêche pas de traiter les autres.
        Renvoie le nombre de générations arrivées à un état final."""
        finished = 0
        for generation in self._uow.generations.list_pending(self._clock.now(), limit):
            try:
                if self._refresh(generation).status.is_final:
                    finished += 1
            except Exception as exc:  # erreur du fournisseur, du réseau...
                self._uow.rollback()
                logger.warning(
                    "generation.sweep_failed id=%s error=%s", generation.id, exc.__class__.__name__
                )
        return finished

    def _refresh(self, generation: Generation) -> Generation:
        if generation.status.is_final:
            return generation
        now = self._clock.now()
        if now - generation.created_at > self._max_age:
            hours = int(self._max_age.total_seconds() // 3600)
            expired = replace(
                generation,
                status=GenerationStatus.FAILED,
                error_message=f"Suivi abandonné : la génération n'a pas abouti en {hours} h",
                updated_at=now,
            )
            self._uow.generations.update(expired)
            self._uow.commit()
            return expired
        if not self._uow.generations.try_lease(generation.id, now, now + REFRESH_LEASE):
            # Un autre processus suit déjà cette génération : état connu, sans attendre.
            self._uow.rollback()
            return self._uow.generations.get(generation.id) or generation
        # Le bail est validé avant les appels réseau, qui peuvent être longs.
        self._uow.commit()
        try:
            updated = self._poll(generation)
        except BaseException:
            self._uow.rollback()
            self._uow.generations.release_lease(generation.id)
            self._uow.commit()
            raise
        self._uow.generations.update(updated)
        self._uow.commit()
        if updated.status.is_final:
            logger.info("generation.%s id=%s", updated.status.value, updated.id)
        return updated

    def _poll(self, generation: Generation) -> Generation:
        state = self._provider.get_state(generation.kind, generation.provider_task_id)
        updated = replace(generation, status=state.status, updated_at=self._clock.now())
        if state.status is GenerationStatus.SUCCEEDED:
            updated.result_media_ids = self._import_results(generation, state.result_urls)
            if not updated.result_media_ids:
                updated.status = GenerationStatus.FAILED
                updated.error_message = "La génération n'a renvoyé aucun résultat"
        elif state.status is GenerationStatus.FAILED:
            updated.error_message = state.error_message or "La génération a échoué"
        return updated

    def list_owned(
        self,
        owner_id: UUID,
        limit: int = 50,
        offset: int = 0,
        source_media_id: UUID | None = None,
    ) -> Sequence[Generation]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError("Pagination invalide")
        return self._uow.generations.list_by_owner(owner_id, limit, offset, source_media_id)

    def check_provider(self) -> ProviderHealth:
        return self._provider.check()

    # ------------------------------------------------------------------ #
    def _validate(self, data: GenerationInput) -> None:
        prompt = data.prompt.strip()
        needs_prompt = data.kind is not GenerationKind.IMAGE_TO_VIDEO
        if needs_prompt and not prompt:
            raise ValidationError("Le prompt est requis")
        if len(prompt) > MAX_PROMPT_LENGTH or len(data.negative_prompt) > MAX_PROMPT_LENGTH:
            raise ValidationError(f"Prompt trop long (max {MAX_PROMPT_LENGTH} caractères)")
        if data.aspect_ratio is not None and data.aspect_ratio not in ASPECT_RATIOS:
            raise ValidationError("Format d'image (aspect ratio) non supporté")
        if data.duration not in DURATIONS:
            raise ValidationError("Durée invalide (5 ou 10 secondes)")
        if data.mode not in MODES:
            raise ValidationError("Mode invalide (std ou pro)")
        if data.refer_type not in REFER_TYPES:
            raise ValidationError("Type de référence invalide (base ou feature)")
        if not 1 <= data.count <= 9:
            raise ValidationError("Nombre d'images invalide (1 à 9)")
        if data.kind is GenerationKind.IMAGE_TO_VIDEO and data.source_media_id is None:
            raise ValidationError("Une image source est requise")

    def _build_request(self, owner_id: UUID, data: GenerationInput) -> GenerationRequest:
        image_b64: str | None = None
        video_url: str | None = None

        if data.source_media_id is not None:
            source = self._media.get(owner_id, data.source_media_id)
            if data.kind is GenerationKind.IMAGE_TO_VIDEO:
                if source.kind is not MediaKind.IMAGE:
                    raise ValidationError("Le média source doit être une image")
                if source.size_bytes > KLING_MAX_IMAGE_BYTES:
                    raise ValidationError("Image trop lourde pour Kling (10 Mo max)")
                image_b64 = base64.b64encode(self._media.read_bytes(source)).decode("ascii")
            elif data.kind is GenerationKind.OMNI_VIDEO:
                if source.kind is not MediaKind.VIDEO:
                    raise ValidationError("Le média source doit être une vidéo")
                video_url = self._public_url(source.id)
            else:
                raise ValidationError("Ce type de génération n'accepte pas de média source")

        return GenerationRequest(
            kind=data.kind,
            prompt=data.prompt.strip(),
            negative_prompt=data.negative_prompt.strip(),
            aspect_ratio=data.aspect_ratio,
            duration=data.duration,
            mode=data.mode,
            count=data.count,
            image_base64=image_b64,
            video_url=video_url,
            refer_type=data.refer_type,
            keep_original_sound=data.keep_original_sound,
        )

    def _public_url(self, media_id: UUID) -> str:
        if not self._links.base_url:
            raise ConfigurationError(
                "GOLDFX_PUBLIC_BASE_URL n'est pas configurée : Kling doit pouvoir "
                "télécharger la vidéo source via une URL publique (domaine de "
                "production ou tunnel type ngrok en local)."
            )
        token = self._signer.sign(str(media_id), self._clock.now() + self._links.ttl)
        return f"{self._links.base_url.rstrip('/')}/api/public/media/{token}"

    def _import_results(self, generation: Generation, urls: list[str]) -> list[UUID]:
        imported: list[UUID] = []
        for index, url in enumerate(urls, start=1):
            data, _content_type = self._provider.download(url, self._max_result_bytes)
            media = self._media.add_derived(
                owner_id=generation.owner_id,
                data=data,
                display_name=f"kling_{generation.kind.value}_{generation.id.hex[:8]}_{index}",
                source=MediaSource.GENERATED,
                parent_id=generation.source_media_id,
            )
            imported.append(media.id)
        return imported
