"""Configuration centralisee : variables d'environnement, chemins, constantes.

Toutes les valeurs sensibles proviennent de l'environnement (fichier .env en
developpement). Si SECRET_KEY est absent, une cle aleatoire est generee pour la
session en cours (avertissement explicite) plutot qu'une valeur codee en dur.
"""

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

# Le fichier .env vit a la racine du depot (voir .env.example).
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("goldfx")

DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
VIDEO_FOLDER = DATA_DIR / "videos"
IMAGE_FOLDER = DATA_DIR / "images"
API_UPLOADS_FOLDER = DATA_DIR / "api_uploads"
USERS_FILE = DATA_DIR / "users.json"

TEMPLATES_DIR = FRONTEND_DIR / "templates"
STATIC_DIR = FRONTEND_DIR / "static"

for _folder in (DATA_DIR, VIDEO_FOLDER, IMAGE_FOLDER, API_UPLOADS_FOLDER):
    _folder.mkdir(parents=True, exist_ok=True)


def _env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


# --- Securite / sessions ---
SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
    logger.warning(
        "SECRET_KEY non defini : une cle aleatoire a ete generee (les sessions seront "
        "invalidees a chaque redemarrage). Definissez SECRET_KEY en production."
    )

SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "goldfx_session")
SESSION_MAX_AGE = int(os.environ.get("SESSION_MAX_AGE", str(60 * 60 * 24 * 7)))
SESSION_HTTPS_ONLY = _env_bool("SESSION_HTTPS_ONLY", False)

# --- API externe de traitement (demo) ---
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:5001").rstrip("/")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

# --- Email (formulaire de contact) ---
MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
MAIL_USE_TLS = _env_bool("MAIL_USE_TLS", True)
MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
MAIL_DEFAULT_SENDER = os.environ.get(
    "MAIL_DEFAULT_SENDER", MAIL_USERNAME or "noreply@projet-ydays.com"
)
CONTACT_RECIPIENT = os.environ.get("CONTACT_RECIPIENT", "ricardo.mbesob@ynov.com")

# --- Limites d'upload ---
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# --- Kling AI ---
KLING_API_BASE_URL = os.environ.get("KLING_API_BASE_URL", "https://api.klingai.com").rstrip("/")
KLING_ACCESS_KEY = os.environ.get("KLING_ACCESS_KEY", "")
KLING_SECRET_KEY = os.environ.get("KLING_SECRET_KEY", "")
KLING_TIMEOUT_SECONDS = float(os.environ.get("KLING_TIMEOUT_SECONDS", "60"))
KLING_MAX_RETRIES = int(os.environ.get("KLING_MAX_RETRIES", "3"))

# --- Cache / performance ---
CACHE_TTL_SECONDS = float(os.environ.get("CACHE_TTL_SECONDS", "5"))
STATIC_CACHE_SECONDS = int(os.environ.get("STATIC_CACHE_SECONDS", str(60 * 60 * 24 * 365)))
MEDIA_CACHE_SECONDS = int(os.environ.get("MEDIA_CACHE_SECONDS", str(60 * 60)))
ENABLE_GZIP = _env_bool("ENABLE_GZIP", True)
GZIP_MINIMUM_SIZE = int(os.environ.get("GZIP_MINIMUM_SIZE", "500"))
TEMPLATE_AUTO_RELOAD = _env_bool("TEMPLATE_AUTO_RELOAD", False)

# --- Base de donnees ---
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}")
USER_STORE = os.environ.get("USER_STORE", "sqlalchemy").strip().lower()


def _env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


def _env_quotas(name: str) -> dict[str, int]:
    """Parse "kling=100,huggingface=1000" en {"kling": 100, ...}."""
    quotas: dict[str, int] = {}
    for item in os.environ.get(name, "").split(","):
        if "=" in item:
            key, _, value = item.partition("=")
            if value.strip().isdigit():
                quotas[key.strip()] = int(value.strip())
    return quotas


# --- Routage multi-fournisseurs (proxy LLM / generation) ---
# Ordre de priorite des fournisseurs ; le routeur choisit le premier eligible.
LLM_PROVIDER_PRIORITY = _env_list("LLM_PROVIDER_PRIORITY", "kling,huggingface,local")
# Quotas quotidiens par fournisseur (vide = illimite). Ex : "kling=100,huggingface=1000".
LLM_QUOTAS = _env_quotas("LLM_QUOTAS")
LLM_TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT_SECONDS", "60"))

# Hugging Face Inference (routeur compatible API OpenAI) - ex. MiniMax, Qwen...
HF_API_BASE_URL = os.environ.get("HF_API_BASE_URL", "https://router.huggingface.co/v1").rstrip("/")
HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "")
HF_MODEL = os.environ.get("HF_MODEL", "MiniMaxAI/MiniMax-M2")

# LLM local (Ollama, vLLM, llama.cpp...) expose en API compatible OpenAI.
LOCAL_LLM_BASE_URL = os.environ.get("LOCAL_LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
LOCAL_LLM_MODEL = os.environ.get("LOCAL_LLM_MODEL", "llama3.1")
LOCAL_LLM_API_KEY = os.environ.get("LOCAL_LLM_API_KEY", "local")

# --- Medias ---
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "avi", "mov", "mkv", "webm"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"}
ALLOWED_EXTENSIONS = ALLOWED_VIDEO_EXTENSIONS | ALLOWED_IMAGE_EXTENSIONS

IMAGE_MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "webp": "image/webp",
    "svg": "image/svg+xml",
}
VIDEO_MIME_TYPES = {
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "webm": "video/webm",
    "avi": "video/x-msvideo",
    "mkv": "video/x-matroska",
}
