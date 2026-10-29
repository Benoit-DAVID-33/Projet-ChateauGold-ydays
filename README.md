# GOLD FX — Gestion et édition de médias avec IA

Application web **FastAPI** (ASGI) qui permet le traitement des **vidéos** et **images**, avec ajout d'**effets spéciaux**. Interface **GOLD FX** avec éditeur canvas, export vidéo annoté, API externe de traitement, **Assistant IA** (prompt engineering) et intégration **Kling AI**.

> **Architecture du backend, performances, cache et base de données** : voir
> [`backend/README.md`](backend/README.md) (carte du code, comparatif avant/après,
> gestion des erreurs Kling, guide SQLAlchemy plug-and-play).

## Accès en ligne

- **GOLD FX online** : `https://projet-ydays-hy9x.onrender.com`

## Se connecter à l’application en ligne

1. Ouvrir `https://projet-ydays-hy9x.onrender.com`
2. Utiliser les identifiants suivants :
  - **Connexion** : Château Gold

## Fonctionnalités

L’application permet de :

- Uploader et visualiser vidéos et images (drag & drop, formats multiples)
- Annoter les médias (formes, lignes, texte, feutre/gomme, objets 3D sur vidéo)
- Enregistrer une vidéo complète avec annotations (MP4 via FFmpeg ou WebM)
- Envoyer médias et requêtes texte à une **API externe** (port 5001)
- Générer des **prompts structurés** à partir des annotations (Assistant IA)
- Utiliser **Kling AI** pour génération / transformation vidéo (optionnel)

## Prérequis

- **Python 3.10+** recommandé (3.7+ minimum)
- **pip**
- **FFmpeg** (optionnel mais recommandé) : export MP4 avec bande-son pour les vidéos annotées
- **Docker + Docker Compose** (optionnel) : déploiement sans installer Python/FFmpeg localement

## Installation locale

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd "projet ydays"

# 2. Environnement virtuel
python -m venv venv

# Windows
env\Scripts\activate

# Linux / macOS
source env/bin/activate

# 3. Dépendances
pip install -r backend/requirements.txt
```

### Configuration (`.env`)

Créez un fichier `.env` à la racine (non versionné) :

```env
# Clé secrète des sessions (obligatoire en production)
SECRET_KEY=changez-moi-par-une-cle-aleatoire

# API externe (traitement médias / requêtes)
API_BASE_URL=http://localhost:5001

# Contact (Gmail : mot de passe d'application)
MAIL_USERNAME=votre@email.com
MAIL_PASSWORD=mot_de_passe_application

# Kling AI (optionnel)
KLING_ACCESS_KEY=votre_access_key
KLING_SECRET_KEY=votre_secret_key
KLING_API_BASE_URL=https://api.klingai.com

# URL publique pour Omni-Video (vidéo locale → Kling)
# Ex. avec ngrok : ngrok http 5000 puis :
PUBLIC_BASE_URL=https://xxxx.ngrok-free.app

# Sessions / uploads
SESSION_HTTPS_ONLY=false
MAX_UPLOAD_MB=500
```


| Variable          | Rôle                                                            |
| ----------------- | --------------------------------------------------------------- |
| `SECRET_KEY`      | Signature des sessions (obligatoire en production)              |
| `API_BASE_URL`    | URL de `external_api.py` (défaut : `http://localhost:5001`)     |
| `MAIL_*`          | Envoi du formulaire Contact                                     |
| `KLING_*`         | Authentification API Kling (JWT)                                |
| `PUBLIC_BASE_URL` | Requis pour transformer une vidéo uploadée via Kling Omni-Video |
| `MAX_UPLOAD_MB`   | Taille maximale des uploads (défaut : 500)                      |


## Lancement

### Application web (FastAPI / ASGI)

Développement (rechargement automatique) :

```bash
cd backend
uvicorn main:app --reload --port 5000
```

Production (serveur granian, plusieurs workers) :

```bash
cd backend
granian --interface asgi --host 0.0.0.0 --port 5000 --workers 2 main:app
```

→ [http://localhost:5000](http://localhost:5000)

### API externe (traitement démo)

Dans un second terminal :

```bash
cd backend
uvicorn external_api:app --port 5001
```

→ [http://localhost:5001](http://localhost:5001)

### Docker Compose

```bash
docker compose up --build
```


| Service | Port | Rôle                                              |
| ------- | ---- | ------------------------------------------------- |
| `web`   | 5000 | Application FastAPI (FFmpeg inclus dans l’image)  |
| `api`   | 5001 | API externe de traitement                         |


Volume monté : `backend/data/` (`images/`, `videos/`, `api_uploads/`, `users.json`).

## Utilisation rapide

### Page d’accueil

Landing page avec présentation des fonctionnalités, liens vers **Vidéo** et **Image**, et sections « Comment ça marche » / outils disponibles.

### Édition image / vidéo

1. Chargez un média sur `/image` ou `/video`.
2. Ouvrez **Outils** : formes, lignes, texte, dessin ; sur vidéo : **objets 3D** (cube, bille, hexagone).
3. **Sauvegarder** l’image modifiée ou **Enregistrer la vidéo avec annotations** (badge de progression 0–100 %).
4. **ENVOYER** : envoi du média (et du texte de la barre de recherche) vers l’API externe.

Détails : rotation 3D (Maj/Alt + glisser), timing des annotations à l’export vidéo, conversion WebM→MP4 côté serveur.

### Assistant IA (prompt engineering)

Sur les pages **Image** et **Vidéo**, bouton orange **Assistant IA** :

- Résumé des éléments annotés (position, taille, type)
- Génération de prompt structuré pour l’IA
- Copie, export JSON, envoi vers l’API

Documentation complémentaire :

- [README_ASSISTANT_IA.md](README_ASSISTANT_IA.md) — vue d’ensemble
- [GUIDE_PROMPT_ENGINEERING.md](GUIDE_PROMPT_ENGINEERING.md) — guide détaillé

### Kling AI (optionnel)

Routes proxy dans `server/routers/kling.py` (clés dans `.env`, authentification requise) :


| Méthode | Route                                    | Description                             |
| ------- | ---------------------------------------- | --------------------------------------- |
| `GET`   | `/kling/test`                            | Test de connexion (auth)                |
| `POST`  | `/kling/generate-image`                  | Génération d’image                      |
| `GET`   | `/kling/image-status/<task_id>`          | Statut image                            |
| `POST`  | `/kling/generate-video`                  | Texte → vidéo                           |
| `GET`   | `/kling/video-status/<task_id>`          | Statut vidéo                            |
| `POST`  | `/kling/image-to-video`                  | Image URL → vidéo                       |
| `GET`   | `/kling/image-to-video-status/<task_id>` | Statut image-to-video                   |
| `POST`  | `/kling/omni-video`                      | Transformation vidéo + prompt           |
| `GET`   | `/kling/omni-video-status/<task_id>`     | Statut + téléchargement local si succès |


Pour **Omni-Video** avec une vidéo du dossier `backend/data/videos/`, configurez `PUBLIC_BASE_URL` (tunnel ngrok ou URL de déploiement) afin que Kling puisse récupérer le fichier.

### Reconnaissance vocale

Micro dans la barre de recherche (Chrome, Edge, Safari) : dictée → champ de recherche → **ENVOYER**.

## Structure du projet

```
projet ydays/
├── backend/                  # Serveur FastAPI (Python, ASGI)
│   ├── main.py               # Point d'entrée ASGI (create_app)
│   ├── server/               # Application modulaire
│   │   ├── __init__.py       # create_app : middleware, routeurs, erreurs
│   │   ├── config.py         # Configuration (variables d'environnement)
│   │   ├── security.py       # Utilisateurs + hachage des mots de passe
│   │   ├── deps.py           # Dépendances d'authentification
│   │   ├── schemas.py        # Modèles Pydantic (validation)
│   │   ├── media.py          # Médias : extensions, chemins sûrs, FFmpeg
│   │   ├── mailer.py         # Envoi d'emails (SMTP)
│   │   ├── kling.py          # Client async Kling AI (httpx)
│   │   ├── api_client.py     # Client async vers l'API externe
│   │   ├── templating.py     # Rendu Jinja2 + compatibilité Flask
│   │   └── routers/          # auth, pages, media, kling
│   ├── external_api.py       # API externe (FastAPI, port 5001)
│   ├── requirements.txt
│   ├── requirements-dev.txt  # pytest, ruff
│   ├── pyproject.toml        # Config ruff + pytest
│   ├── tests/                # Tests pytest
│   ├── run_tests.py          # Lanceur de tests
│   └── data/                 # Données : images/, videos/, api_uploads/, users.json
├── frontend/                 # Interface (servie par FastAPI)
│   ├── static/
│   │   ├── css/   (style.css, prompt-manager.css)
│   │   └── js/    (script.js, zoom.js, media-editor.js,
│   │               prompt-generator.js, api-integration.js)
│   └── templates/
│       ├── base.html, header.html, footer.html
│       ├── home.html         # Landing page
│       ├── video.html, image.html
│       └── information.html, contact.html, search.html
├── docs/
├── docker-compose.yml
├── Dockerfile.web / Dockerfile.api
├── README_ASSISTANT_IA.md
└── GUIDE_PROMPT_ENGINEERING.md
```

## Routes principales

Les routes sont réparties dans `backend/server/routers/` (`pages`, `auth`, `media`, `kling`).

**Pages**


| Route                  | Description                       |
| ---------------------- | --------------------------------- |
| `GET /`                | Accueil (landing)                 |
| `GET /video`, `/image` | Édition médias                    |
| `GET /information`     | Documentation intégrée            |
| `GET /contact`         | Formulaire (email via SMTP)       |
| `GET /search?q=`       | Recherche                         |
| `GET /login`, `/register`, `/logout` | Authentification      |


**API médias** (authentification requise)


| Route                            | Description                       |
| -------------------------------- | --------------------------------- |
| `POST /upload`                   | Upload fichier                    |
| `GET /videos/<f>`, `/images/<f>` | Servir un média                   |
| `POST /delete/<f>`               | Supprimer                         |
| `POST /send-to-api/<f>`          | Proxy vers API externe            |
| `POST /send-query-to-api`        | Requête texte (+ média optionnel) |
| `POST /process-query`            | Éléments annotés → API externe    |
| `POST /api/convert-webm-to-mp4`  | Conversion enregistrement annoté  |


**Documentation interactive** : `GET /api/docs` (OpenAPI).

Voir la section **Kling AI** pour les routes `/kling/*` (toutes protégées par authentification).

## Formats supportés

**Vidéos :** MP4, AVI, MOV, MKV, WEBM  

**Images :** JPG, JPEG, PNG, GIF, BMP, WEBP, SVG

## Dépendances

Principales (voir `backend/requirements.txt`) :

- FastAPI, Starlette, Uvicorn / Granian (ASGI)
- Pydantic v2 (validation), sérialisation JSON native rapide
- httpx (client HTTP asynchrone), Jinja2, python-multipart
- itsdangerous (sessions), Werkzeug (hachage), PyJWT, python-dotenv

Outils de développement (`backend/requirements-dev.txt`) : pytest, ruff.

### Qualité et tests

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
ruff check . && ruff format --check .   # lint + format
python run_tests.py                     # ou : pytest
```

## Sécurité (production)

- Serveur ASGI multi-workers (granian), pas de serveur de développement
- `debug` désactivé, erreurs non détaillées renvoyées au client
- Authentification requise sur toutes les routes médias et `/kling/*`
- `SECRET_KEY` obligatoire (sessions signées, `SESSION_HTTPS_ONLY=true` derrière HTTPS)
- Limite de taille d'upload (`MAX_UPLOAD_MB`) et validation des extensions
- Chemins de fichiers assainis (pas de traversée de répertoire)
- Mots de passe hachés (PBKDF2) ; secrets uniquement via variables d'environnement
- Ne pas committer `.env` ni `backend/data/users.json`

## Démarrage rapide

```bash
pip install -r backend/requirements.txt
# Copier et remplir .env (SECRET_KEY, MAIL, KLING si besoin)
cd backend
uvicorn external_api:app --port 5001     # terminal 1
uvicorn main:app --port 5000             # terminal 2
# Ouvrir http://localhost:5000
```

## Licence

Projet fourni tel quel, sans garantie.

## Auteur

Projet développé dans le cadre de **YDays**.

## Changelog

### Version 4.0

- **Migration Flask → FastAPI** (ASGI) : application modulaire (`server/`), routeurs `pages`/`auth`/`media`/`kling`
- **Performance** : client HTTP asynchrone `httpx` (I/O non bloquants), serveur **granian** multi-workers, `orjson`, validation **Pydantic v2**
- **Robustesse** : FFmpeg exécuté dans un thread, conversions atomiques, gestion d'erreurs sans fuite, config centralisée
- **Sécurité** : authentification sur les routes médias et `/kling/*`, limite d'upload, chemins assainis, `SECRET_KEY` obligatoire
- **Qualité** : ruff (lint + format), tests pytest, documentation OpenAPI (`/api/docs`)

### Version 3.0

- Page d’accueil **landing** (hero vidéo, fonctionnalités, processus, CTA)
- Intégration **Kling AI** (`kling_api.py`, routes `/kling/`*, Omni-Video)
- **Assistant IA** : extraction géométrique des annotations et génération de prompts
- Configuration `**.env`** unifiée (`python-dotenv`, PyJWT)
- Documentation : `README_ASSISTANT_IA.md`, `GUIDE_PROMPT_ENGINEERING.md`

### Versions 2.8 – 2.13

Enregistrement vidéo avec annotations, objets 3D, menus harmonisés, logo GOLD FX, reconnaissance vocale, édition canvas liée au scroll, contact par email, Docker Compose. Voir l’historique Git pour le détail.

### Version 1.0

Support vidéo de base et upload initial.