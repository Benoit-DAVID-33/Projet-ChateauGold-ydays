"""Envoi de médias / requêtes au service de traitement externe."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from goldfx.domain.errors import ValidationError
from goldfx.domain.models import Media, MediaSource
from goldfx.domain.ports import MediaProcessor, QueryAnswer

from .media import MediaService

MAX_QUERY_LENGTH = 4000


@dataclass(frozen=True, slots=True)
class SearchResult:
    query: str
    answer: QueryAnswer | None
    processed_media: Media | None


class ProcessingService:
    def __init__(self, media: MediaService, processor: MediaProcessor) -> None:
        self._media = media
        self._processor = processor

    def process_media(self, owner_id: UUID, media_id: UUID, query: str) -> Media:
        """Envoie un média (et le texte éventuel) au service ; enregistre le résultat
        comme média dérivé, rattaché à l'original."""
        query = _clean_query(query, allow_empty=True)
        original = self._media.get(owner_id, media_id)
        with self._media.open(original) as handle:
            result = self._processor.process_media(
                handle, original.original_name, original.content_type, query
            )
        return self._media.add_derived(
            owner_id=owner_id,
            data=result.data,
            display_name=f"processed_{original.original_name}",
            source=MediaSource.PROCESSED,
            parent_id=original.id,
        )

    def search(self, owner_id: UUID, query: str, media_id: UUID | None = None) -> SearchResult:
        """Barre de recherche : requête texte seule, ou requête + média."""
        if media_id is not None:
            processed = self.process_media(owner_id, media_id, query)
            return SearchResult(query=query.strip(), answer=None, processed_media=processed)
        cleaned = _clean_query(query, allow_empty=False)
        return SearchResult(
            query=cleaned, answer=self._processor.process_query(cleaned), processed_media=None
        )


def _clean_query(query: str, *, allow_empty: bool) -> str:
    query = (query or "").strip()
    if not query and not allow_empty:
        raise ValidationError("Requête vide")
    if len(query) > MAX_QUERY_LENGTH:
        raise ValidationError(f"Requête trop longue (max {MAX_QUERY_LENGTH} caractères)")
    return query
