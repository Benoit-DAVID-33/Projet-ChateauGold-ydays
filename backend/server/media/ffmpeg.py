"""Operations FFmpeg : sonde, decoupe, normalisation, assemblage, audio, image.

Toutes les fonctions sont **bloquantes** (sous-processus) : les appeler via
``run_in_threadpool`` / ``asyncio.to_thread`` depuis le code asynchrone. FFmpeg
relache le GIL pendant l'attente, un thread suffit.

Securite : binaire resolu par ``shutil.which`` (chemin absolu), arguments
passes en liste, jamais de shell : pas d'injection de commande possible.

Qualite : decoupes **a l'image pres** (re-encodage H.264, CRF 17, yuv420p),
segments normalises a la resolution et a la cadence de la source pour que
l'assemblage final soit sans saut ; la piste audio d'origine est remise sur
la video finale (continuite sonore parfaite).
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_ENCODE = ("-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p")
_TIMEOUT_SECONDS = 900


class FfmpegError(RuntimeError):
    """Echec d'une commande FFmpeg (message = fin de la sortie d'erreur)."""


@dataclass(frozen=True)
class VideoInfo:
    """Caracteristiques techniques d'une video."""

    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool
    size_bytes: int

    @property
    def aspect_ratio(self) -> str:
        """Ratio simplifie le plus proche parmi les formats usuels."""
        ratio = self.width / self.height if self.height else 0
        known = {"16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1.0, "4:3": 4 / 3, "21:9": 21 / 9}
        return min(known, key=lambda key: abs(known[key] - ratio))

    def as_dict(self) -> dict:
        """Representation JSON."""
        return {
            "duration": round(self.duration, 3),
            "width": self.width,
            "height": self.height,
            "fps": round(self.fps, 3),
            "has_audio": self.has_audio,
            "size_mb": round(self.size_bytes / 1_000_000, 2),
            "aspect_ratio": self.aspect_ratio,
        }


def _binary(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise FfmpegError(f"{name} introuvable dans le PATH")
    return path


def _run(args: list[str], timeout: float = _TIMEOUT_SECONDS) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, check=True, capture_output=True, timeout=timeout)
    except subprocess.CalledProcessError as exc:
        tail = exc.stderr.decode("utf-8", errors="replace")[-600:]
        raise FfmpegError(f"Échec FFmpeg : {tail.strip()}") from exc
    except subprocess.TimeoutExpired as exc:
        raise FfmpegError("FFmpeg a dépassé le délai autorisé") from exc


def _parse_fps(rate: str) -> float:
    numerator, _, denominator = rate.partition("/")
    try:
        value = float(numerator) / float(denominator or 1)
    except (ValueError, ZeroDivisionError):
        return 0.0
    return value


@lru_cache(maxsize=256)
def _probe_cached(path: str, mtime_ns: int, size: int) -> VideoInfo:
    del mtime_ns  # fait partie de la cle de cache : un fichier modifie est re-sonde
    result = _run(
        [
            _binary("ffprobe"),
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ],
        timeout=60,
    )
    data = json.loads(result.stdout or b"{}")
    streams = data.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if video is None:
        raise FfmpegError("Aucune piste vidéo dans ce fichier")
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    return VideoInfo(
        duration=duration,
        width=int(video.get("width", 0)),
        height=int(video.get("height", 0)),
        fps=_parse_fps(video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"),
        has_audio=any(item.get("codec_type") == "audio" for item in streams),
        size_bytes=size,
    )


def probe(path: Path) -> VideoInfo:
    """Sonde une video (resultat mis en cache tant que le fichier ne change pas)."""
    stat = Path(path).stat()
    return _probe_cached(str(path), stat.st_mtime_ns, stat.st_size)


def cut(source: Path, start: float, end: float, destination: Path) -> Path:
    """Extrait [start, end] a l'image pres, sans audio (remis a la fin du montage)."""
    _run(
        [
            _binary("ffmpeg"),
            "-y",
            "-ss",
            f"{start:.3f}",
            "-i",
            str(source),
            "-t",
            f"{max(0.04, end - start):.3f}",
            *_ENCODE,
            "-an",
            "-movflags",
            "+faststart",
            str(destination),
        ]
    )
    return destination


def normalize(source: Path, destination: Path, width: int, height: int, fps: float) -> Path:
    """Remet un segment au format exact de la source (taille, cadence) pour l'assemblage."""
    scale = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps:.3f}"
    )
    _run(
        [
            _binary("ffmpeg"),
            "-y",
            "-i",
            str(source),
            "-vf",
            scale,
            *_ENCODE,
            "-an",
            str(destination),
        ]
    )
    return destination


def concat(parts: list[Path], destination: Path) -> Path:
    """Assemble des segments deja normalises (copie de flux, sans re-encodage)."""
    listing = destination.with_suffix(".txt")
    listing.write_text(
        "".join(f"file '{part.resolve().as_posix()}'\n" for part in parts), encoding="utf-8"
    )
    _run(
        [
            _binary("ffmpeg"),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(listing),
            "-c",
            "copy",
            str(destination),
        ]
    )
    listing.unlink(missing_ok=True)
    return destination


def mux_audio(video: Path, audio_source: Path, destination: Path) -> Path:
    """Remet la piste audio d'origine sur la video montee (si la source en a une)."""
    _run(
        [
            _binary("ffmpeg"),
            "-y",
            "-i",
            str(video),
            "-i",
            str(audio_source),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0?",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(destination),
        ]
    )
    return destination


def extract_frame(source: Path, at_seconds: float, destination: Path) -> Path:
    """Exporte une image (PNG) : sert de reference de continuite entre deux segments."""
    _run(
        [
            _binary("ffmpeg"),
            "-y",
            "-ss",
            f"{max(0.0, at_seconds):.3f}",
            "-i",
            str(source),
            "-frames:v",
            "1",
            str(destination),
        ],
        timeout=60,
    )
    return destination


def webm_to_mp4(path_in: str, path_out: str) -> None:
    """Convertit un WebM en MP4 (H.264 / AAC) avec faststart."""
    _run(
        [
            _binary("ffmpeg"),
            "-y",
            "-i",
            path_in,
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            path_out,
        ],
        timeout=600,
    )
