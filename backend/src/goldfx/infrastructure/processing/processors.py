"""Adapters du port ``MediaProcessor``.

* ``EchoMediaProcessor`` reproduit le comportement historique de
  ``external_api.py`` (renvoie le média tel quel, accuse réception de la
  requête) sans service séparé : l'application fonctionne « out of the box ».
* ``HttpMediaProcessor`` parle au contrat HTTP historique
  (``POST /process-video`` multipart, ``POST /process-query`` JSON) : un vrai
  service d'IA respectant ce contrat se branche sans toucher au code.
"""

from __future__ import annotations

from datetime import datetime
from typing import BinaryIO

import httpx

from goldfx.domain.errors import ExternalServiceError
from goldfx.domain.ports import Clock, ProcessedMedia, QueryAnswer


class EchoMediaProcessor:
    def __init__(self, clock: Clock) -> None:
        self._clock = clock

    def process_media(
        self, data: BinaryIO, filename: str, content_type: str, query: str
    ) -> ProcessedMedia:
        return ProcessedMedia(data=data.read(), content_type=content_type)

    def process_query(self, query: str) -> QueryAnswer:
        return QueryAnswer(
            response=f"Requête reçue : « {query} ». Traitement en cours...",
            timestamp=self._clock.now(),
        )


class HttpMediaProcessor:
    def __init__(self, base_url: str, timeout_seconds: float, clock: Clock) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._clock = clock

    def process_media(
        self, data: BinaryIO, filename: str, content_type: str, query: str
    ) -> ProcessedMedia:
        try:
            response = httpx.post(
                f"{self._base_url}/process-video",
                files={"file": (filename, data, content_type)},
                data={"query": query},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                "processor", "Impossible de joindre le service de traitement"
            ) from exc
        if response.status_code != 200:
            raise ExternalServiceError(
                "processor", f"Le service de traitement a répondu {response.status_code}"
            )
        return ProcessedMedia(
            data=response.content,
            content_type=response.headers.get("content-type", content_type),
        )

    def process_query(self, query: str) -> QueryAnswer:
        try:
            response = httpx.post(
                f"{self._base_url}/process-query", json={"query": query}, timeout=30.0
            )
            body = response.json() if response.status_code == 200 else {}
        except (httpx.HTTPError, ValueError) as exc:
            raise ExternalServiceError(
                "processor", "Impossible de joindre le service de traitement"
            ) from exc
        if response.status_code != 200:
            raise ExternalServiceError(
                "processor", f"Le service de traitement a répondu {response.status_code}"
            )
        timestamp = self._clock.now()
        raw_ts = body.get("timestamp")
        if isinstance(raw_ts, str):
            try:
                parsed = datetime.fromisoformat(raw_ts)
                timestamp = parsed if parsed.tzinfo else timestamp
            except ValueError:
                pass
        return QueryAnswer(response=str(body.get("response", "")), timestamp=timestamp)
