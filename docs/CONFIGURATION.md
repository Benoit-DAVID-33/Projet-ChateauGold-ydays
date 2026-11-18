# Référence de configuration

L'API se configure uniquement par variables d'environnement (principe 12-factor), toutes
préfixées `GOLDFX_`. En développement, un fichier `.env` placé dans `backend/` (lancement local)
ou à la racine (Docker Compose) est lu automatiquement. Le modèle documenté est
[`.env.example`](../.env.example).

Source de vérité : `backend/src/goldfx/config.py` (classe `Settings`, validée au démarrage).

## Contrôles au démarrage

Quand `GOLDFX_ENVIRONMENT=production`, l'API refuse de démarrer si :

- `GOLDFX_SECRET_KEY` fait moins de 32 caractères ou vaut une valeur d'exemple connue ;
- `GOLDFX_COOKIE_SECURE` vaut `false` ;
- `GOLDFX_CONTACT_RECIPIENT` est vide.

Le message d'erreur liste tous les problèmes en une fois.

## Application

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_ENVIRONMENT` | `development` | `production`, `development` ou `test`. En production, la documentation interactive `/api/docs` est désactivée et les contrôles ci-dessus s'appliquent. |
| `GOLDFX_SECRET_KEY` | vide | Clé de signature des liens publics temporaires. Obligatoire en production (32 caractères minimum). Génération : `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `GOLDFX_PUBLIC_BASE_URL` | vide | URL HTTPS publique de l'application (sans `/` final). Nécessaire pour Kling Omni-Video, qui télécharge la vidéo source via un lien signé. |
| `GOLDFX_CORS_ORIGINS` | `[]` | Origines autorisées (liste JSON, ex. `["https://app.example.com"]`). Inutile quand le frontend et l'API partagent le même domaine, ce qui est le cas avec nginx. |
| `GOLDFX_LOG_LEVEL` | `INFO` | Niveau de journalisation (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `GOLDFX_LOG_JSON` | `false` | Journaux en JSON (une ligne par événement). Activé par défaut dans l'image Docker. |
| `GOLDFX_WORKERS` | `2` | Nombre de processus uvicorn (lu par `docker-entrypoint.sh`). |
| `GOLDFX_FORWARDED_ALLOW_IPS` | localhost et réseaux privés (`127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7`) | Proxys de confiance pour `X-Forwarded-For` (lu par `docker-entrypoint.sh`). L'adresse client retenue est la première, en partant de la droite, qui n'en fait pas partie. Ajouter l'adresse du reverse proxy TLS s'il est sur une autre machine avec une adresse publique. Ne jamais mettre `*`. |

## Base de données

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_DATABASE_URL` | `sqlite:///./data/goldfx.db` | URL SQLAlchemy. PostgreSQL : `postgresql://utilisateur:motdepasse@hote:5432/base` (le pilote psycopg 3 est sélectionné automatiquement). Avec Docker Compose, elle est construite à partir des variables `POSTGRES_*`. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `goldfx`, `goldfx`, aucun | Utilisées uniquement par `compose.yaml` (conteneur PostgreSQL). `POSTGRES_PASSWORD` est obligatoire. |

## Sessions et sécurité

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_SESSION_TTL_HOURS` | `168` | Durée de vie d'une session (7 jours). |
| `GOLDFX_COOKIE_SECURE` | `true` | Cookies envoyés uniquement en HTTPS. Mettre `false` seulement en développement HTTP local. |
| `GOLDFX_PASSWORD_MIN_LENGTH` | `8` | Longueur minimale des mots de passe à l'inscription. |
| `GOLDFX_LOGIN_MAX_ATTEMPTS` | `10` | Tentatives de connexion autorisées par fenêtre, par adresse IP et identifiant. |
| `GOLDFX_LOGIN_WINDOW_SECONDS` | `300` | Durée de la fenêtre de limitation (secondes). |
| `GOLDFX_SIGNED_URL_TTL_SECONDS` | `3600` | Validité des liens publics signés transmis à Kling. |

## Stockage des médias

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_STORAGE_DIR` | `./data/media` | Répertoire des fichiers. Dans l'image Docker : `/data/media` (volume `media-data`). |
| `GOLDFX_MAX_IMAGE_MB` | `25` | Taille maximale d'une image (Mo). |
| `GOLDFX_MAX_VIDEO_MB` | `500` | Taille maximale d'une vidéo (Mo). Penser à aligner `client_max_body_size` dans `frontend/nginx.conf`. |

## Service de traitement externe

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_PROCESSOR_BACKEND` | `echo` | `echo` : traitement factice intégré (renvoie le média reçu, accuse réception des requêtes texte). `http` : service externe respectant le contrat décrit dans [API.md](API.md#contrat-du-service-de-traitement-externe). |
| `GOLDFX_PROCESSOR_URL` | `http://processor:5001` | URL du service externe (mode `http`). |
| `GOLDFX_PROCESSOR_TIMEOUT_SECONDS` | `300` | Délai maximal d'un traitement de média. |

## Kling AI

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_KLING_ACCESS_KEY` | vide | Clé d'accès Kling (console développeur Kling). |
| `GOLDFX_KLING_SECRET_KEY` | vide | Clé secrète Kling (signature du jeton JWT). |
| `GOLDFX_KLING_BASE_URL` | `https://api.klingai.com` | Point d'accès de l'API Kling. |
| `GOLDFX_KLING_IMAGE_MODEL` | `kling-v1` | Modèle utilisé pour texte vers image. |
| `GOLDFX_KLING_VIDEO_MODEL` | `kling-v1` | Modèle utilisé pour texte vers vidéo et image vers vidéo. |
| `GOLDFX_KLING_OMNI_MODEL` | `kling-video-o1` | Modèle utilisé pour Omni-Video. |
| `GOLDFX_KLING_TIMEOUT_SECONDS` | `60` | Délai des appels à l'API Kling. |
| `GOLDFX_KLING_DOWNLOAD_TIMEOUT_SECONDS` | `300` | Délai de téléchargement d'un résultat. |
| `GOLDFX_GENERATION_SWEEP_SECONDS` | `30` | Intervalle du suivi de fond des générations non terminées (secondes). `0` le désactive ; il ne démarre que si les clés Kling sont renseignées. |
| `GOLDFX_GENERATION_MAX_AGE_HOURS` | `24` | Âge au-delà duquel une génération toujours en cours est déclarée en échec. |

Sans clés, l'application fonctionne ; les générations renvoient une erreur explicite
« Kling n'est pas configuré » et le bouton « Tester la connexion Kling » l'indique.

## Conversion vidéo (ffmpeg)

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_FFMPEG_BINARY` | `ffmpeg` | Chemin de l'exécutable (installé dans l'image Docker). |
| `GOLDFX_FFMPEG_TIMEOUT_SECONDS` | `600` | Durée maximale d'une conversion. |
| `GOLDFX_FFMPEG_MAX_CONCURRENCY` | `2` | Conversions simultanées maximales par processus. |

## Emails (formulaire de contact)

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_MAIL_BACKEND` | `console` | `console` : les emails sont écrits dans les journaux de l'API. `smtp` : envoi réel. |
| `GOLDFX_CONTACT_RECIPIENT` | vide | Destinataire des messages du formulaire de contact. Obligatoire en production. |
| `GOLDFX_MAIL_FROM` | `noreply@goldfx.local` | Adresse d'expédition. |
| `GOLDFX_SMTP_HOST` | `localhost` | Serveur SMTP. |
| `GOLDFX_SMTP_PORT` | `587` | Port SMTP. |
| `GOLDFX_SMTP_USERNAME` | vide | Identifiant SMTP (vide : pas d'authentification). |
| `GOLDFX_SMTP_PASSWORD` | vide | Mot de passe SMTP. Pour Gmail, utiliser un mot de passe d'application. |
| `GOLDFX_SMTP_STARTTLS` | `true` | Chiffrement STARTTLS (port 587). |
| `GOLDFX_SMTP_SSL` | `false` | Connexion SSL directe (port 465). |

## Exposition (Docker Compose)

| Variable | Défaut | Description |
|---|---|---|
| `GOLDFX_HTTP_PORT` | `8080` | Port publié par le conteneur `web` sur l'hôte. |
| `GOLDFX_VERSION` | `latest` | Étiquette des images construites. |

## Frontend

Le frontend n'a pas de configuration d'exécution : il appelle toujours `/api` sur sa propre
origine. En développement, `GOLDFX_API_URL` (défaut `http://localhost:8000`) indique à Vite où
relayer `/api` (`frontend/vite.config.ts`).
