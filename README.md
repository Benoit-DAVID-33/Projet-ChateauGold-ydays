# GOLD FX

Application web d'édition et de génération de médias assistée par IA :

- upload d'images et de vidéos (glisser-déposer) ;
- annotation : formes, lignes, texte, dessin, objets 3D, calques et chronologie ;
- export annoté en PNG ou en MP4 ;
- **Atelier** en trois colonnes sur le modèle de Stable Diffusion WebUI : outils, prompt et
  paramètres ; canevas ; sorties et historique ;
- génération **Kling AI** : texte vers image, texte vers vidéo, image vers vidéo, Omni-Video ;
- **Workflow** : graphe de nœuds sur le modèle de ComfyUI, enregistré par utilisateur ;
- envoi à un service de traitement externe.

Version 2 : refonte complète de l'application Flask d'origine. La correspondance fonctionnalité
par fonctionnalité et la reprise des comptes sont décrites dans
[docs/MIGRATION.md](docs/MIGRATION.md).

## Stack

| Couche | Technologies |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 et Alembic, Pydantic 2, Argon2id, httpx |
| Frontend | React 19, TypeScript strict, Vite, TanStack Query, Zustand, React Flow, CSS Modules |
| Données | PostgreSQL 16 (SQLite en développement et en test), fichiers sur volume |
| Exploitation | images Docker multi-étapes non-root, nginx, Docker Compose, GitHub Actions |
| Qualité | ruff, mypy strict, pytest ; eslint, tsc, vitest ; Playwright ; pre-commit |

## Démarrage rapide (Docker)

```bash
cp .env.example .env          # renseigner GOLDFX_SECRET_KEY, POSTGRES_PASSWORD, clés Kling
make up                       # docker compose up -d --build
```

L'application répond sur http://localhost:8080. Reprise facultative des comptes de la
version 1 :

```bash
make import-users FILE=chemin/vers/users.json
```

## Développement local (sans Docker)

Prérequis : [uv](https://docs.astral.sh/uv/), Node 22, ffmpeg.

```bash
make install
make dev-api      # API sur :8000 (SQLite, rechargement à chaud), documentation sur /api/docs
make dev-web      # frontend sur :5173, /api relayé vers :8000
```

Variante tout en conteneurs, avec rechargement et Mailpit pour lire les emails :
`make up-dev` (emails sur http://localhost:8025).

## Commandes utiles

```bash
make help         # liste complète
make check        # lint, typage et tests (backend et frontend)
make e2e          # parcours de bout en bout dans Chromium
make openapi      # régénère le contrat OpenAPI et les types TypeScript
```

## Organisation du dépôt

```
backend/             API FastAPI : domaine, application, infrastructure, api
frontend/            SPA React : app, pages, features (atelier, workflow, editor...), shared
e2e/                 tests de bout en bout (Playwright) et faux serveur Kling
docs/                documentation (voir l'index ci-dessous)
compose.yaml         stack de production (db, api, web)
compose.dev.yaml     surcouche de développement
.github/workflows/   intégration continue
```

## Documentation

L'index complet est dans [docs/README.md](docs/README.md).

| Pour | Lire |
|---|---|
| utiliser l'application | [Guide utilisateur](docs/GUIDE_UTILISATEUR.md) |
| développer | [Guide développeur](docs/GUIDE_DEVELOPPEUR.md), [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [CONTRIBUTING](CONTRIBUTING.md) |
| déployer et exploiter | [Exploitation](docs/EXPLOITATION.md), [Configuration](docs/CONFIGURATION.md), [Sécurité](docs/SECURITE.md) |
| suivre l'évolution | [CHANGELOG](CHANGELOG.md), [Feuille de route IA](docs/ROADMAP_IA.md), [décisions d'architecture](docs/adr/) |
