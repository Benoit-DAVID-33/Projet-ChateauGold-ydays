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
# Les fournisseurs gratuits sont en tete ; les payants ne servent que si
# LLM_FREE_ONLY=false.
LLM_PROVIDER_PRIORITY = _env_list(
    "LLM_PROVIDER_PRIORITY", "local,openrouter,groq,gemini,huggingface,kling,minimax"
)
# Garde-fou budget : true (defaut) = le proxy n'utilise QUE des fournisseurs
# gratuits ; aucun compte (Hugging Face, Kling, MiniMax) ne peut etre debite.
LLM_FREE_ONLY = _env_bool("LLM_FREE_ONLY", True)
# Quotas quotidiens par fournisseur (vide = illimite). Ex : "openrouter=50,groq=1000".
LLM_QUOTAS = _env_quotas("LLM_QUOTAS")
# Compteurs persistes (un redemarrage ne remet pas les quotas du jour a zero).
LLM_QUOTA_FILE = Path(os.environ.get("LLM_QUOTA_FILE") or DATA_DIR / "llm_quota.json")
LLM_TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT_SECONDS", "60"))
# Duree de cache de l'etat des fournisseurs (console d'admin).
LLM_HEALTH_CACHE_SECONDS = float(os.environ.get("LLM_HEALTH_CACHE_SECONDS", "30"))

# LLM local (Ollama, vLLM, llama.cpp...) expose en API compatible OpenAI : gratuit.
LOCAL_LLM_BASE_URL = os.environ.get("LOCAL_LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
LOCAL_LLM_MODEL = os.environ.get("LOCAL_LLM_MODEL", "llama3.1")
LOCAL_LLM_API_KEY = os.environ.get("LOCAL_LLM_API_KEY", "local")

# OpenRouter : seuls les modeles suffixes ":free" sont factures 0 $ (impose par le code).
OPENROUTER_API_BASE_URL = os.environ.get(
    "OPENROUTER_API_BASE_URL", "https://openrouter.ai/api/v1"
).rstrip("/")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-20b:free")

# Groq : palier gratuit (limites par minute/jour) tant que le compte n'est pas
# passe au palier payant « Developer ».
GROQ_API_BASE_URL = os.environ.get("GROQ_API_BASE_URL", "https://api.groq.com/openai/v1").rstrip(
    "/"
)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FREE_TIER = _env_bool("GROQ_FREE_TIER", True)

# Google Gemini (endpoint compatible OpenAI) : palier gratuit tant que la
# facturation n'est pas activee sur le projet Google AI Studio.
GEMINI_API_BASE_URL = os.environ.get(
    "GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"
).rstrip("/")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_FREE_TIER = _env_bool("GEMINI_FREE_TIER", True)

# Hugging Face Inference (routeur compatible API OpenAI). PAYANT : chaque requete
# est facturee au proprietaire du jeton (aucun credit pour un compte gratuit).
# Seul HF_API_TOKEN est lu : jamais HF_TOKEN ni le cache `huggingface-cli login`.
HF_API_BASE_URL = os.environ.get("HF_API_BASE_URL", "https://router.huggingface.co/v1").rstrip("/")
HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "")
HF_MODEL = os.environ.get("HF_MODEL", "MiniMaxAI/MiniMax-M2")
# Comptes dont le jeton est refuse (ex. compte personnel) et compte attendu.
HF_FORBIDDEN_ACCOUNTS = frozenset(_env_list("HF_FORBIDDEN_ACCOUNTS", ""))
HF_EXPECTED_ACCOUNT = os.environ.get("HF_EXPECTED_ACCOUNT", "").strip()
# Organisation Team/Enterprise a facturer (en-tete X-HF-Bill-To) ; vide = aucun.
HF_BILL_TO = os.environ.get("HF_BILL_TO", "").strip()

# MiniMax (API compatible OpenAI pour le texte) : payant. La generation video
# MiniMax (H3) utilise un endpoint dedie non implemente ici.
MINIMAX_API_BASE_URL = os.environ.get("MINIMAX_API_BASE_URL", "https://api.minimax.io/v1").rstrip(
    "/"
)
MINIMAX_MODEL = os.environ.get("MINIMAX_MODEL", "MiniMax-Text-01")
MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")

# --- Prompt engineering video-to-video ---
# Conversion automatique du prompt avant l'envoi a Kling Omni-Video.
PROMPT_AUTO_ENHANCE = _env_bool("PROMPT_AUTO_ENHANCE", True)

# --- Edition video par IA (server/video_editing) ---
# Cles des fournisseurs d'edition video (tous PAYANTS : chaque generation est
# facturee au compte de la cle). Sans cle, le modele est affiche « indisponible ».
FAL_API_KEY = os.environ.get("FAL_API_KEY", "")
FAL_QUEUE_URL = os.environ.get("FAL_QUEUE_URL", "https://queue.fal.run").rstrip("/")
DECART_API_KEY = os.environ.get("DECART_API_KEY", "")
DECART_API_BASE_URL = os.environ.get("DECART_API_BASE_URL", "https://api.decart.ai").rstrip("/")
LUMA_API_KEY = os.environ.get("LUMA_API_KEY", "")
LUMA_API_BASE_URL = os.environ.get("LUMA_API_BASE_URL", "https://agents.lumalabs.ai").rstrip("/")
# Dossier de travail des montages (segments, resultats intermediaires, etat des travaux).
VIDEO_JOBS_DIR = Path(os.environ.get("VIDEO_JOBS_DIR") or DATA_DIR / "edit_jobs")
VIDEO_MAX_CONCURRENT_JOBS = int(os.environ.get("VIDEO_MAX_CONCURRENT_JOBS", "2"))
VIDEO_POLL_INTERVAL_SECONDS = float(os.environ.get("VIDEO_POLL_INTERVAL_SECONDS", "5"))
VIDEO_GENERATION_TIMEOUT_SECONDS = float(os.environ.get("VIDEO_GENERATION_TIMEOUT_SECONDS", "1800"))
# true = aucun appel payant : le travail est planifie, decoupe et reassemble
# sans modification IA (utile en demo et en developpement).
VIDEO_EDITING_SIMULATE = _env_bool("VIDEO_EDITING_SIMULATE", False)

# --- Offres (server/accounts/plans.py) ---
PLAN_FREE_DAILY_GENERATIONS = int(os.environ.get("PLAN_FREE_DAILY_GENERATIONS", "2"))
PLAN_FREE_MAX_JOB_COST_USD = float(os.environ.get("PLAN_FREE_MAX_JOB_COST_USD", "1.5"))
PLAN_STUDIO_DAILY_GENERATIONS = int(os.environ.get("PLAN_STUDIO_DAILY_GENERATIONS", "30"))
PLAN_STUDIO_MAX_JOB_COST_USD = float(os.environ.get("PLAN_STUDIO_MAX_JOB_COST_USD", "25"))
PLAN_STUDIO_PRICE_LABEL = os.environ.get("PLAN_STUDIO_PRICE_LABEL", "Sur demande")
# Comptes autorises a attribuer une offre (vide = personne).
ADMIN_USERS = frozenset(_env_list("ADMIN_USERS", ""))

# --- Emoji (studio backend) ---
# URLs essayees dans l'ordre ({lang} = en/fr). Le fichier local, s'il est defini,
# court-circuite le reseau.
EMOJI_DATA_URLS = _env_list(
    "EMOJI_DATA_URLS",
    "https://cdn.jsdelivr.net/npm/emojibase-data@latest/{lang}/data.json,"
    "https://cdn.jsdelivr.net/npm/emojibase-data/{lang}/compact.json,"
    "https://unpkg.com/emojibase-data@latest/{lang}/compact.json",
)
EMOJI_DATA_FILE = os.environ.get("EMOJI_DATA_FILE", "")
EMOJI_CACHE_TTL = float(os.environ.get("EMOJI_CACHE_TTL", str(60 * 60 * 24)))
EMOJI_MAX_RESULTS = int(os.environ.get("EMOJI_MAX_RESULTS", "120"))

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
