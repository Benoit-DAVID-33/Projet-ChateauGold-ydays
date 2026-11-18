from __future__ import annotations

import io
from pathlib import Path

import pytest

from goldfx.domain.errors import NotFoundError, PayloadTooLargeError, ValidationError
from goldfx.domain.models import MediaKind
from goldfx.infrastructure.storage.detection import MagicBytesDetector
from goldfx.infrastructure.storage.local import LocalFileStorage

from ..fakes import JPEG_BYTES, MP4_BYTES, SVG_BYTES, png_bytes


class TestDetection:
    detector = MagicBytesDetector()

    @pytest.mark.parametrize(
        ("header", "kind", "ctype"),
        [
            (png_bytes(), MediaKind.IMAGE, "image/png"),
            (JPEG_BYTES, MediaKind.IMAGE, "image/jpeg"),
            (b"GIF89a" + b"\x00" * 10, MediaKind.IMAGE, "image/gif"),
            (b"RIFF\x00\x00\x00\x00WEBPVP8 ", MediaKind.IMAGE, "image/webp"),
            (b"BM" + b"\x00" * 30, MediaKind.IMAGE, "image/bmp"),
            (MP4_BYTES, MediaKind.VIDEO, "video/mp4"),
            (b"\x00\x00\x00\x14ftypqt  \x00\x00", MediaKind.VIDEO, "video/quicktime"),
            (b"\x1a\x45\xdf\xa3\x9f\x42\x82\x84webm", MediaKind.VIDEO, "video/webm"),
            (b"\x1a\x45\xdf\xa3\x9f\x42\x82\x88matroska", MediaKind.VIDEO, "video/x-matroska"),
            (b"RIFF\x00\x00\x00\x00AVI LIST", MediaKind.VIDEO, "video/x-msvideo"),
        ],
    )
    def test_known_types(self, header: bytes, kind: MediaKind, ctype: str) -> None:
        detected = self.detector.detect(header[:64])
        assert detected is not None
        assert (detected.kind, detected.content_type) == (kind, ctype)

    @pytest.mark.parametrize(
        "header",
        [SVG_BYTES, b"<html><script>", b"%PDF-1.7", b"\x00\x00\x00\x18ftypavif", b"MZ\x90\x00"],
    )
    def test_dangerous_or_unknown_types_rejected(self, header: bytes) -> None:
        assert self.detector.detect(header) is None


class TestLocalStorage:
    def test_save_open_delete(self, tmp_path: Path) -> None:
        storage = LocalFileStorage(tmp_path)
        size = storage.save("u1/a.png", io.BytesIO(b"hello"), max_bytes=10)
        assert size == 5
        with storage.open("u1/a.png") as handle:
            assert handle.read() == b"hello"
        storage.delete("u1/a.png")
        with pytest.raises(NotFoundError):
            storage.local_path("u1/a.png")

    def test_limit_leaves_no_partial_file(self, tmp_path: Path) -> None:
        storage = LocalFileStorage(tmp_path)
        with pytest.raises(PayloadTooLargeError):
            storage.save("u1/big.bin", io.BytesIO(b"x" * 100), max_bytes=10)
        assert not any(p.is_file() for p in tmp_path.rglob("*"))

    @pytest.mark.parametrize("key", ["../etc/passwd", "/abs", "a/../../b", "a//b", "", ".hidden"])
    def test_path_traversal_rejected(self, tmp_path: Path, key: str) -> None:
        storage = LocalFileStorage(tmp_path / "root")
        with pytest.raises(ValidationError):
            storage.save_bytes(key, b"x")
