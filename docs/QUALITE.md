# Qualité : tests, analyse statique, intégration continue

## Vue d'ensemble

| Niveau | Backend | Frontend |
|---|---|---|
| Formatage | `ruff format` | `prettier` |
| Lint | `ruff check` (pycodestyle, pyflakes, isort, bugbear, pyupgrade, bandit, simplifications, nommage, pathlib) | `eslint` (typescript-eslint, React Hooks, React Refresh), zéro avertissement toléré |
| Typage | `mypy --strict` | `tsc` en mode `strict` |
| Tests unitaires | `pytest` : services avec doublures (`tests/fakes.py`), adapters, sécurité, client Kling (transport HTTP simulé) | `vitest` et Testing Library : modèle de l'éditeur, générateur de prompts, moteur de workflow, composants |
| Tests d'intégration | `pytest` : API complète via `TestClient`, sur SQLite et sur PostgreSQL | composants reliés au client API simulé |
| Contrat | `backend/openapi.json` régénéré et comparé | `schema.d.ts` régénéré et comparé |
| Dépendances | `pip-audit` sur les dépendances d'exécution (lockfile) | `npm audit --omit=dev` (niveau high) sur les dépendances livrées |
| Migrations | `alembic check` : le schéma des migrations correspond au modèle | |
| Bout en bout | Playwright (Chromium) : parcours utilisateur réel contre l'API et le build de production | |

Commande unique, identique à la CI pour les étapes rapides :

```bash
make check        # lint + typage + tests, backend et frontend
```

## Backend

```bash
cd backend
uv run ruff format --check . && uv run ruff check .
uv run mypy
uv run pytest --cov                                     # SQLite
GOLDFX_TEST_DATABASE_URL=postgresql://goldfx:goldfx@localhost:5432/goldfx_test uv run pytest
```

Organisation des tests :

- `tests/unit/` : un fichier par sujet. Les services sont testés avec des doublures en mémoire
  (horloge figée, fournisseur IA simulé, stockage temporaire) sans base ni réseau.
- `tests/integration/` : une application FastAPI complète par test (`create_app(settings,
  container)`), avec une base vide. Le fournisseur Kling est remplacé par
  `FakeGenerationProvider`, le mailer par `ConsoleMailer`.
- `tests/conftest.py` fournit la classe `Api`, qui gère le jeton CSRF et l'authentification :

```python
def test_exemple(api: Api) -> None:
    api.signup()                                   # inscription + connexion
    r = api.post("/api/workflows", json={"name": "Test", "graph": GRAPHE})
    assert r.status_code == 201
```

- `make_api()` crée plusieurs clients indépendants pour tester l'isolation entre utilisateurs.
- ffmpeg est requis : les tests qui utilisent la fixture `webm_file` sont ignorés sans lui, mais
  `test_ffmpeg_errors` échoue.
- Avec `GOLDFX_TEST_DATABASE_URL`, chaque test repart d'un schéma PostgreSQL vide.

## Frontend

```bash
cd frontend
npm run format:check && npm run lint && npm run typecheck
npm test               # ou npm run coverage
```

- Les tests sont placés à côté du code (`*.test.ts`, `*.test.tsx`).
- Les appels réseau sont simulés au niveau de `shared/api` ; les composants sont testés par leur
  comportement visible (rôles, libellés), pas par leur structure interne.
- Les fonctions pures (génération de prompts, géométrie de l'éditeur, exécution des workflows)
  sont testées sans DOM.

## Tests de bout en bout

Le dossier `e2e/` contient un parcours Playwright qui pilote Chromium contre l'API réelle (SQLite,
service de traitement factice, faux Kling `e2e/fake_kling.py`) et le build de production du frontend servi par
`vite preview`.

```bash
make e2e          # construit le frontend, démarre l'API et l'aperçu, joue le parcours
```

Le parcours couvre notamment : garde d'authentification, inscription et connexion, upload,
outils d'annotation, export PNG à la résolution native, export MP4 annoté (vérifié avec
`ffprobe`), envoi à l'API de traitement, Atelier et Workflow, bibliothèque, contact, recherche
sans injection HTML, affichage mobile et déconnexion. Les captures d'écran sont écrites dans
`e2e/out/`. Détails dans [e2e/README.md](../e2e/README.md).

## Intégration continue

Le fichier `.github/workflows/ci.yml` s'exécute sur chaque push vers `main` ou `refonte/**` et
sur chaque pull request :

| Job | Étapes |
|---|---|
| Backend | audit pip-audit, format, lint, mypy, tests SQLite avec couverture, tests PostgreSQL 16 (service), `alembic check`, contrat OpenAPI à jour |
| Frontend | audit npm, types API à jour, format, lint, typecheck, tests avec couverture, build |
| Bout en bout | installe ffmpeg, Playwright et Chromium, puis joue `e2e/run.sh` ; captures et journaux publiés en artefact |
| Images Docker | construction des deux images (cache GitHub Actions), validation des fichiers compose |

Un échec bloque la fusion si la protection de branche est activée sur `main` (recommandé :
exiger les quatre jobs).

## Hooks pre-commit

```bash
pipx install pre-commit && pre-commit install
```

Avant chaque commit : espaces en fin de ligne, fin de fichier, YAML valide, fichiers volumineux,
clés privées, ruff (backend), prettier et eslint (frontend).

## Règles de contribution liées à la qualité

- Toute nouvelle route est couverte par un test d'intégration (cas nominal, erreur de validation,
  accès d'un autre utilisateur).
- Toute logique métier frontend non triviale vit dans une fonction pure testée.
- Après une modification de l'API : `make openapi`, puis committer `openapi.json` et
  `schema.d.ts`.
- Après une modification du modèle de données : une migration Alembic (voir
  [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md#modifier-le-schéma-de-la-base)).
- Ni emoji ni symbole décoratif dans le code, l'interface ou la documentation.
