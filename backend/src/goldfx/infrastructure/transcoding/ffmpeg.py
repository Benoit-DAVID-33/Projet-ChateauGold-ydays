from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from goldfx.domain.errors import ExternalServiceError

logger = logging.getLogger(__name__)


class FfmpegTranscoder:
    def __init__(self, binary: str, timeout_seconds: int) -> None:
        self._binary = binary
        self._timeout = timeout_seconds

    def to_mp4(self, source: Path, destination: Path) -> None:
        command = [
            self._binary,
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-i", str(source),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            # Dimensions paires obligatoires pour H.264 / yuv420p.
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:a", "aac",
            "-movflags", "+faststart",
            str(destination),
        ]  # fmt: skip
        try:
            subprocess.run(  # noqa: S603 - pas de shell, entrée contrôlée
                command, check=True, capture_output=True, timeout=self._timeout
            )
        except FileNotFoundError as exc:
            raise ExternalServiceError(
                "ffmpeg", "ffmpeg n'est pas installé sur le serveur"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise ExternalServiceError("ffmpeg", "Conversion trop longue, abandonnée") from exc
        except subprocess.CalledProcessError as exc:
            logger.warning("ffmpeg.failed stderr=%s", exc.stderr.decode(errors="replace")[-2000:])
            raise ExternalServiceError("ffmpeg", "La conversion vidéo a échoué") from exc
        if not destination.is_file() or destination.stat().st_size == 0:
            raise ExternalServiceError("ffmpeg", "Fichier MP4 non créé")
