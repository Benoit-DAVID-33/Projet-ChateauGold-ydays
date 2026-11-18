"""Détection du type réel d'un fichier à partir de ses premiers octets.

On ne fait jamais confiance à l'extension ni au Content-Type envoyés par le
client. Le SVG est volontairement refusé : il peut embarquer du JavaScript.
"""

from __future__ import annotations

from goldfx.domain.models import MediaKind
from goldfx.domain.ports import DetectedType

_IMAGE = MediaKind.IMAGE
_VIDEO = MediaKind.VIDEO


class MagicBytesDetector:
    def detect(self, header: bytes) -> DetectedType | None:
        h = header
        if h.startswith(b"\xff\xd8\xff"):
            return DetectedType(_IMAGE, "image/jpeg", ".jpg")
        if h.startswith(b"\x89PNG\r\n\x1a\n"):
            return DetectedType(_IMAGE, "image/png", ".png")
        if h[:6] in (b"GIF87a", b"GIF89a"):
            return DetectedType(_IMAGE, "image/gif", ".gif")
        if h[:4] == b"RIFF" and h[8:12] == b"WEBP":
            return DetectedType(_IMAGE, "image/webp", ".webp")
        if h[:2] == b"BM" and len(h) >= 14:
            return DetectedType(_IMAGE, "image/bmp", ".bmp")
        if h[:4] == b"RIFF" and h[8:12] == b"AVI ":
            return DetectedType(_VIDEO, "video/x-msvideo", ".avi")
        if h[:4] == b"\x1a\x45\xdf\xa3":
            # Matroska / WebM : le « DocType » figure dans l'en-tête EBML.
            if b"webm" in h[:64]:
                return DetectedType(_VIDEO, "video/webm", ".webm")
            return DetectedType(_VIDEO, "video/x-matroska", ".mkv")
        if h[4:8] == b"ftyp":
            brand = h[8:12]
            if brand == b"qt  ":
                return DetectedType(_VIDEO, "video/quicktime", ".mov")
            if brand in (b"avif", b"avis", b"heic", b"heix", b"mif1", b"msf1"):
                return None  # images ISO-BMFF non supportées par l'éditeur
            return DetectedType(_VIDEO, "video/mp4", ".mp4")
        return None
