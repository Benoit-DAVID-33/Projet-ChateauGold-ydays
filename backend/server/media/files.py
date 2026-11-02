"""Helpers fichiers medias : extensions acceptees, types MIME, chemins surs.

Les operations video (decoupe, conversion...) sont dans ``server.media.ffmpeg``.
"""

from server import config


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
    from werkzeug.utils import secure_filename  # import differe

    safe = secure_filename(filename or "")
    return safe or None


def safe_path(folder, filename: str):
    """Retourne un chemin sur dans `folder`, ou None en cas de traversee."""
    from werkzeug.utils import secure_filename  # import differe

    safe_name = secure_filename(filename or "")
    if not safe_name:
        return None
    folder_resolved = folder.resolve()
    candidate = (folder / safe_name).resolve()
    if candidate != folder_resolved and folder_resolved not in candidate.parents:
        return None
    return candidate
