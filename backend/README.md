# GOLD FX : backend

API FastAPI (Python 3.12+) organisée en couches. Voir [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) et
[docs/GUIDE_DEVELOPPEUR.md](../docs/GUIDE_DEVELOPPEUR.md).

```
src/goldfx/
  domain/          entités, erreurs métier, ports (interfaces) ; aucune dépendance à un framework
  application/     cas d'usage (auth, médias, traitement, génération IA, conversion, contact, workflows)
  infrastructure/  adaptateurs : SQLAlchemy, stockage disque, Kling, ffmpeg, SMTP, sécurité
  api/             HTTP : routers, schémas, middlewares, traduction des erreurs
  container.py     racine de composition (seul endroit qui connaît les implémentations)
  config.py        configuration typée (variables GOLDFX_*)
  main.py          fabrique ASGI : uvicorn --factory goldfx.main:create_app
```

## Démarrage local (sans Docker)

```bash
uv sync                                  # dépendances (crée .venv)
uv run alembic upgrade head              # schéma (SQLite par défaut : ./data/goldfx.db)
uv run uvicorn --factory goldfx.main:create_app --reload --port 8000
# Documentation interactive : http://localhost:8000/api/docs
```

## Qualité

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy                    # typage strict
uv run pytest --cov            # SQLite
GOLDFX_TEST_DATABASE_URL=postgresql://user:pass@localhost/goldfx_test uv run pytest   # PostgreSQL
```

## Administration

```bash
uv run goldfx import-users ../ancien/backend/data/users.json   # comptes de l'ancienne app
uv run goldfx create-user alice alice@example.com
```

Les mots de passe importés (hashes werkzeug) restent valides et sont
re-hachés en Argon2id à la première connexion.

## Migrations

```bash
uv run alembic revision --autogenerate -m "description"   # après modification de infrastructure/db/schema.py
uv run alembic upgrade head
```
