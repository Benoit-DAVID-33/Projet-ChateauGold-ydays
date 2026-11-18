# GOLD FX : commandes courantes. `make help` pour la liste.
.DEFAULT_GOAL := help
SHELL := /bin/bash
COMPOSE := docker compose -f compose.yaml
COMPOSE_DEV := $(COMPOSE) -f compose.dev.yaml

.PHONY: help install dev-api dev-web test test-api test-web e2e lint format typecheck check openapi build up up-dev down logs migrate import-users

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances backend (uv) et frontend (npm)
	cd backend && uv sync
	cd frontend && npm ci

dev-api: ## Lance l'API en local (SQLite, rechargement à chaud) sur :8000
	cd backend && GOLDFX_COOKIE_SECURE=false uv run alembic upgrade head && GOLDFX_COOKIE_SECURE=false uv run uvicorn --factory goldfx.main:create_app --reload --port 8000

dev-web: ## Lance le frontend Vite sur :5173 (proxy de /api vers :8000)
	cd frontend && npm run dev

test: test-api test-web ## Lance tous les tests

test-api: ## Tests backend avec couverture
	cd backend && uv run pytest --cov

test-web: ## Tests frontend avec couverture
	cd frontend && npm run coverage

e2e: ## Tests de bout en bout (Playwright, Chromium) : API, faux Kling et build du frontend
	./e2e/run.sh

lint: ## Lint backend (ruff) et frontend (eslint + prettier)
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint && npm run format:check

format: ## Formate tout le code
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run format

typecheck: ## Typage strict (mypy + tsc)
	cd backend && uv run mypy
	cd frontend && npm run typecheck

check: lint typecheck test ## Tout ce que la CI vérifie

openapi: ## Régénère le contrat OpenAPI et les types TypeScript du frontend
	cd backend && uv run goldfx openapi openapi.json
	cd frontend && npm run gen:api

build: ## Construit les images Docker
	$(COMPOSE) build

up: ## Démarre la stack de production (nécessite .env)
	$(COMPOSE) up -d --build

up-dev: ## Démarre la stack de développement (Mailpit, API en reload)
	$(COMPOSE_DEV) up --build

down: ## Arrête la stack
	$(COMPOSE) down

logs: ## Suit les logs
	$(COMPOSE) logs -f --tail=100

migrate: ## Applique les migrations dans le conteneur API
	$(COMPOSE) run --rm api migrate

import-users: ## Importe un users.json de l'ancienne app : make import-users FILE=chemin/users.json
	@test -n "$(FILE)" || (echo "Usage : make import-users FILE=chemin/users.json" && exit 1)
	$(COMPOSE) run --rm -v "$(abspath $(FILE)):/tmp/users.json:ro" api goldfx import-users /tmp/users.json
