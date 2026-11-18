"""Doublures de test des ports externes (aucun appel réseau dans les tests)."""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from goldfx.domain.models import GenerationKind, GenerationStatus
from goldfx.domain.ports import GenerationRequest, ProviderHealth, ProviderTaskState


def png_bytes(width: int = 4, height: int = 4) -> bytes:
    """Génère un vrai PNG minimal (pas de dépendance image)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + b"\xff\xd7\x00" * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


MP4_BYTES = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2" + b"\x00" * 2048
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 512
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


class FrozenClock:
    def __init__(self, start: datetime | None = None) -> None:
        self.current = start or datetime(2026, 10, 30, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.current

    def advance(self, **kwargs: float) -> None:
        self.current += timedelta(**kwargs)


@dataclass
class FakeGenerationProvider:
    """Simule Kling : les tâches passent à « succeeded » au 2e interrogatoire."""

    submitted: list[GenerationRequest] = field(default_factory=list)
    polls: dict[str, int] = field(default_factory=dict)
    fail_task: bool = False
    result_payload: bytes = field(default_factory=png_bytes)
    downloads: int = 0

    def submit(self, request: GenerationRequest) -> str:
        self.submitted.append(request)
        return f"task-{len(self.submitted)}"

    def get_state(self, kind: GenerationKind, task_id: str) -> ProviderTaskState:
        self.polls[task_id] = self.polls.get(task_id, 0) + 1
        if self.polls[task_id] < 2:
            return ProviderTaskState(status=GenerationStatus.PROCESSING)
        if self.fail_task:
            return ProviderTaskState(status=GenerationStatus.FAILED, error_message="NSFW refusé")
        return ProviderTaskState(
            status=GenerationStatus.SUCCEEDED, result_urls=["https://cdn.example/result"]
        )

    def download(self, url: str, max_bytes: int) -> tuple[bytes, str]:
        self.downloads += 1
        return self.result_payload, "image/png"

    def check(self) -> ProviderHealth:
        return ProviderHealth(ok=True, message="ok")
