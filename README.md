# GOLD FX — Gestion et édition de médias avec IA

Application web **Flask** qui permet le traitement des **vidéos** et **images**, avec ajout d'**effets spéciaux**. Interface **GOLD FX** avec éditeur canvas, export vidéo annoté, API externe de traitement, **Assistant IA** (prompt engineering) et intégration **Kling AI**.

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
```


| Variable          | Rôle                                                            |
| ----------------- | --------------------------------------------------------------- |
| `API_BASE_URL`    | URL de `external_api.py` (défaut : `http://localhost:5001`)     |
| `MAIL_*`          | Envoi du formulaire Contact                                     |
| `KLING_*`         | Authentification API Kling (JWT)                                |
| `PUBLIC_BASE_URL` | Requis pour transformer une vidéo uploadée via Kling Omni-Video |


## Lancement

### Application web

```bash
python backend/app.py
```

→ [http://localhost:5000](http://localhost:5000)

### API externe (traitement démo)

Dans un second terminal :

```bash
python backend/external_api.py
```

→ [http://localhost:5001](http://localhost:5001)

### Docker Compose

```bash
docker compose up --build
```


| Service | Port | Rôle                                           |
| ------- | ---- | ---------------------------------------------- |
| `web`   | 5000 | Application Flask (FFmpeg inclus dans l’image) |
| `api`   | 5001 | API externe de traitement                      |


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

Routes proxy dans `app.py` (clés dans `.env`) :


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
├── backend/                  # Serveur Flask (Python)
│   ├── app.py                # Application Flask principale
│   ├── external_api.py       # API externe (process-video, process-query)
│   ├── kling_api.py          # Client API Kling AI
│   ├── requirements.txt
│   ├── run_tests.py
│   └── data/                 # Données : images/, videos/, api_uploads/, users.json
├── frontend/                 # Interface (servie par Flask)
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

## Routes principales (`app.py`)

**Pages**


| Route                  | Description                       |
| ---------------------- | --------------------------------- |
| `GET /`                | Accueil (landing)                 |
| `GET /video`, `/image` | Édition médias                    |
| `GET /information`     | Documentation intégrée            |
| `GET /contact`         | Formulaire (email via Flask-Mail) |
| `GET /search?q=`       | Recherche                         |


**API médias**


| Route                            | Description                       |
| -------------------------------- | --------------------------------- |
| `POST /upload`                   | Upload fichier                    |
| `GET /videos/<f>`, `/images/<f>` | Servir un média                   |
| `POST /delete/<f>`               | Supprimer                         |
| `POST /send-to-api/<f>`          | Proxy vers API externe            |
| `POST /send-query-to-api`        | Requête texte (+ média optionnel) |
| `POST /api/convert-webm-to-mp4`  | Conversion enregistrement annoté  |


Voir la section **Kling AI** pour les routes `/kling/`*.

## Formats supportés

**Vidéos :** MP4, AVI, MOV, MKV, WEBM  

**Images :** JPG, JPEG, PNG, GIF, BMP, WEBP, SVG

## Dépendances

Principales (voir `backend/requirements.txt`) :

- Flask 3.1.2, Werkzeug, Jinja2
- Flask-Mail, requests, python-dotenv
- PyJWT (authentification Kling)

## Sécurité (production)

- Désactiver `debug=True`
- Serveur WSGI (Gunicorn, uWSGI)
- Limiter la taille des uploads et valider les types MIME
- HTTPS, secrets uniquement via variables d’environnement
- Ne pas committer `.env`

## Démarrage rapide

```bash
pip install -r backend/requirements.txt
# Copier et remplir .env (MAIL, KLING si besoin)
python backend/external_api.py    # terminal 1
python backend/app.py             # terminal 2
# Ouvrir http://localhost:5000
```

## Licence

Projet fourni tel quel, sans garantie.

## Auteur

Projet développé dans le cadre de **YDays**.

## Changelog

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