"""Helpers medias : validation d'extensions, chemins surs, conversion FFmpeg.

FFmpeg est un binaire externe : il relache le GIL pendant l'attente du
sous-processus, un thread suffit donc (run_in_threadpool cote routeur) et un
pool de processus serait inutile ici.

Appel FFmpeg : chemin absolu resolu via shutil.which (pas de recherche PATH
implicite) et arguments fixes sans shell, ce qui exclut l'injection de commande.
"""

import shutil
import subprocess

from werkzeug.utils import secure_filename

from . import config


def _ext(filename: str) -> str:
    """Retourne l'extension d'un nom de fichier en minuscules (sans le point)."""
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def allowed_file(filename: str) -> bool:
    """Indique si l'extension fait partie des formats acceptes."""
    return _ext(filename) in config.ALLOWED_EXTENSIONS


def is_image(filename: str) -> bool:
    """Indique si le fichier est une image (d'apres son extension)."""
    return _ext(filename) in config.ALLOWED_IMAGE_EXTENSIONS


def is_video(filename: str) -> bool:
    """Indique si le fichier est une video (d'apres son extension)."""
    return _ext(filename) in config.ALLOWED_VIDEO_EXTENSIONS


def mimetype_for(filename: str) -> str:
    """Retourne le type MIME associe a l'extension du fichier."""
    ext = _ext(filename)
    return (
        config.IMAGE_MIME_TYPES.get(ext)
        or config.VIDEO_MIME_TYPES.get(ext)
        or "application/octet-stream"
    )


def clean_filename(filename: str) -> str | None:
    """Retourne un nom de fichier assaini, ou None s'il est inutilisable."""
    safe = secure_filename(filename or "")
    return safe or None


def safe_path(folder, filename: str):
    """Retourne un chemin sur dans `folder`, ou None en cas de traversee."""
    safe_name = secure_filename(filename or "")
    if not safe_name:
        return None
    folder_resolved = folder.resolve()
    candidate = (folder / safe_name).resolve()
    if candidate != folder_resolved and folder_resolved not in candidate.parents:
        return None
    return candidate


def ffmpeg_webm_to_mp4(path_in: str, path_out: str) -> None:
    """Convertit un WebM en MP4 (H.264 / AAC) avec faststart."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise FileNotFoundError("ffmpeg introuvable dans le PATH")
    subprocess.run(
        [
            ffmpeg,
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
        check=True,
        capture_output=True,
        timeout=600,
    )
