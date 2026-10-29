# Backend GOLD FX — architecture, performances et maintenance

Ce document explique **pourquoi** le backend a été refactoré, **comment** il est
organisé, et **ce que ça change** concrètement (performance, qualité, sécurité,
robustesse, optimisation, maintenabilité). Il sert aussi de carte pour un
humain ou un LLM qui découvre le code.

---

## 1. Pourquoi ce refactor (la cohérence d'ensemble)

L'application d'origine tenait dans un **unique fichier Flask** (`backend/app.py`,
~600 lignes) mélangeant : routes, logique métier, accès fichiers, appels HTTP,
authentification, envoi d'emails et conversion vidéo. Concrètement :

- appels réseau **bloquants** (`requests`) exécutés dans le worker → un appel
  lent gèle tout le reste ;
- **serveur de développement** (`flask run` / `app.run`) en production ;
- **routes sensibles non protégées** (`/delete`, `/upload`, `/kling/*`) ;
- **aucune validation** des entrées, aucune limite d'upload ;
- `users.json` (avec hashes) **versionné dans Git** ;
- `debug=True`, erreurs internes renvoyées au client.

L'objectif du refactor n'était donc pas « changer de framework pour changer »,
mais répondre à cinq besoins **cohérents** :

| Besoin | Réponse retenue |
| --- | --- |
| **Performance** | I/O asynchrone (`httpx`), serveur ASGI multi-workers, gzip, cache |
| **Robustesse** | erreurs typées, validation Pydantic, gestion centralisée |
| **Sécurité** | auth systématique, chemins sûrs, secrets par environnement |
| **Extensibilité** | base SQLAlchemy branchable sans toucher au reste |
| **Lisibilité** | un module = une responsabilité, nommage explicite |

---

## 2. Carte de l'architecture

```
backend/
├── main.py                 # Point d'entree ASGI : app = create_app()
├── external_api.py         # Service externe de demo (FastAPI, port 5001)
├── server/
│   ├── __init__.py         # create_app() : middleware, routeurs, erreurs
│   ├── config.py           # Config centralisee (env, chemins, constantes)
│   ├── caching.py          # TTLCache + gzip selectif + cache statique
│   ├── security.py         # Facade utilisateurs (hachage + cache)
│   ├── db/                 # Persistance SQLAlchemy (plug-and-play)
│   │   ├── contract.py     # Contrat UserStore (sans dependance lourde)
│   │   ├── engine.py       # Moteur + fabrique de sessions (DATABASE_URL)
│   │   ├── models.py       # Modeles SQLAlchemy (User)
│   │   ├── repository.py   # Implementation SQLAlchemy du contrat
│   │   ├── json_store.py   # Impl. fichier JSON (repli / tests)
│   │   └── seed.py         # Import users.json -> base
│   ├── llm/                # Proxy multi-fournisseurs (LLM / generation)
│   │   ├── base.py         # Contrat Provider (+ request / result)
│   │   ├── router.py       # Selection (capacite, quota, priorite, repli)
│   │   ├── quota.py        # Quotas par fournisseur
│   │   ├── kling_provider.py    # Fournisseur Kling AI
│   │   ├── openai_provider.py   # API compatible OpenAI (HF, MiniMax, local)
│   │   └── registry.py     # Construction depuis la configuration
│   ├── deps.py             # Dependances d'auth (401 / redirection login)
│   ├── schemas.py          # Modeles Pydantic (validation des corps JSON)
│   ├── forms.py            # Lecture typee des champs de formulaire
│   ├── http.py             # Fabrique de clients HTTP async partages
│   ├── kling.py            # Client async Kling (JWT + erreurs typees)
│   ├── mailer.py           # Envoi SMTP dans un thread
│   ├── media_tools.py      # Extensions, chemins surs, FFmpeg
│   ├── templating.py       # Rendu Jinja2 + compat Flask + ETag
│   └── routers/            # Endpoints HTTP
│       ├── auth.py         # /login, /register, /logout
│       ├── pages.py        # Pages HTML
│       ├── media.py        # upload, service, suppression, proxy
│       ├── kling.py        # Proxy Kling AI (/kling/*)
│       └── llm.py          # Proxy multi-fournisseurs (/api/llm/*)
├── tests/                  # Suite pytest, rangee par categorie
│   ├── unit/               # Tests unitaires (dependances mockees)
│   ├── integration/        # Tests d'integration (composants ensemble)
│   ├── functional/         # Tests fonctionnels (parcours utilisateur)
│   ├── regression/         # Tests de non-regression (comportements figes)
│   ├── performance/        # Tests de charge (exclus par defaut)
│   ├── conftest.py         # Fixtures + marqueurs automatiques par dossier
│   └── helpers.py          # Doublures (fausses reponses / clients)
├── scripts/                # Outils d'industrialisation
│   ├── profile_app.py      # Profilage cProfile (+ SnakeViz)
│   └── load_test.py        # Test de charge (debit, percentiles)
├── docs/                   # Documentation Sphinx (autodoc + napoleon)
├── requirements.txt        # Dependances d'execution
├── requirements-dev.txt    # Outils qualite (pytest, ruff, mypy, bandit, pylint, sphinx)
└── pyproject.toml          # Metadonnees du paquet + config ruff/mypy/pylint/pytest
```

**Règle de lecture** : le nom du fichier dit la responsabilité.
`caching` = cache, `security` = utilisateurs, `db` = base, `llm` = fournisseurs,
`routers/*` = HTTP. Aucun fichier ne mélange deux responsabilités.

### Flux d'une requête

```
Client
  │
  ▼
[ GZip selectif ] → [ Cache statique ] → [ Session signee ] → [ Limite upload ]
  │
  ▼
Routeur (auth / pages / media / kling / llm)
  │  └─ Dependance d'auth : require_user (401) ou require_user_page (redirect)
  ▼
Service (security, kling, media_tools, mailer, db, llm.router)
  │  └─ Cache memoire pour les lectures couteuses
  ▼
Reponse (HTML avec ETag / fichier avec Cache-Control / JSON)
```

---

## 3. Cache & performance

Les pages sont **personnalisées** (nom et email de l'utilisateur) : un cache
HTML *partagé* serait donc un bug de sécurité. On cache ce qui est cacheable et
on rend le reste **revalidable**. Honnêtement : le vrai coût n'était pas le
rendu Jinja (déjà mis en cache en mémoire), mais une **lecture disque à chaque
requête**.

| Mécanisme | Fichier | Ce que ça apporte |
| --- | --- | --- |
| **Cache utilisateurs** (TTL) | `security.py` + `caching.py` | Évite de relire `users.json` / la base à chaque affichage de page |
| **GZip sélectif** | `caching.py` | Compresse HTML/CSS/JS/JSON, **jamais** les médias (préserve les requêtes HTTP Range de la vidéo) |
| **Cache-Control statique** | `caching.py` | `public, max-age=1 an, immutable` sur `/static/*` |
| **Cache-Control médias** | `routers/media.py` | `private, max-age=1 h` sur `/images/*` et `/videos/*` |
| **ETag + 304 sur HTML** | `templating.py` | Le navigateur revalide les pages : réponse `304` au lieu d'un rechargement complet |
| **Bytecode Jinja** | `templating.py` | Cache de compilation des templates + `auto_reload=False` en prod |

Réglages dans le `.env` : `CACHE_TTL_SECONDS`, `STATIC_CACHE_SECONDS`,
`MEDIA_CACHE_SECONDS`, `ENABLE_GZIP`, `GZIP_MINIMUM_SIZE`, `TEMPLATE_AUTO_RELOAD`.

---

## 4. Gestion des erreurs de l'API Kling

Toute défaillance est traduite en **`KlingError`** (`server/kling.py`) puis en
réponse JSON `{"error", "message", "code"}` — exactement ce que lit le frontend
(`data.error` / `data.message`). Auparavant, une erreur renvoyait
`{"detail": ...}`, donc le front n'affichait **jamais** le vrai message.

| Situation | Statut HTTP | Message |
| --- | --- | --- |
| `code != 0` (erreur métier Kling) | `502` | message Kling d'origine |
| 401 / 403 | `502` | « Authentification Kling refusée (clés invalides ou expirées) » |
| 429 | `503` | « Limite de requêtes Kling atteinte, réessayez dans un instant » |
| 5xx | `502` | « L'API Kling a renvoyé une erreur serveur » |
| Timeout | `504` | « Délai dépassé en contactant l'API Kling » |
| Erreur réseau | `502` | « Impossible de joindre l'API Kling » |
| 404 | `404` | « Ressource Kling introuvable » |

**Réessais** : les 429 et les 5xx sur les lectures (`GET`) sont réessayés avec
un backoff exponentiel borné, en respectant l'en-tête `Retry-After`. Les `POST`
de création ne sont **pas** réessayés sur 5xx (éviter les doublons de tâches).

---

## 5. Proxy multi-fournisseurs (LLM / génération)

Objectif : pouvoir router une demande vers **Kling AI**, un modèle **Hugging
Face** (MiniMax, Qwen…), ou un **LLM local** (Ollama, vLLM), **par
configuration**, sans modifier le code appelant.

Le proxy vit dans `server/llm/` et **ne remplace pas** `/kling/*` : il ajoute un
namespace distinct `/api/llm/*`. La partie existante continue de fonctionner à
l'identique.

```
/api/llm/generate ──▶ Router ──▶ candidats (capacité + quota, par priorité)
                                  ├─ KlingProvider        (image, video)
                                  ├─ OpenAICompatible     (text)  ← HF / MiniMax
                                  └─ OpenAICompatible     (text)  ← LLM local
```

**Politique de sélection** (dans l'ordre) :

1. **capacité** — le fournisseur sait-il faire ce type de génération ?
2. **quota** — on écarte ceux ayant atteint leur limite (`LLM_QUOTAS`) ;
3. **priorité** — ordre de `LLM_PROVIDER_PRIORITY` ;
4. **cohérence** — une tâche déjà confiée reste chez son fournisseur (le suivi
   ne change pas de fournisseur en cours de route) ;
5. **repli** — si le fournisseur échoue, on essaie le suivant.

**Un adaptateur pour plusieurs services** : `OpenAICompatibleProvider` parle
l'API `/chat/completions`, exposée par Hugging Face (routeur d'inférence),
MiniMax, vLLM, Ollama… Changer de service = changer trois variables d'env.

| Variable | Rôle |
| --- | --- |
| `LLM_PROVIDER_PRIORITY` | Ordre des fournisseurs (ex. `kling,huggingface,local`) |
| `LLM_QUOTAS` | Quotas quotidiens (ex. `kling=100,huggingface=1000`) |
| `HF_API_BASE_URL`, `HF_API_TOKEN`, `HF_MODEL` | Hugging Face / MiniMax |
| `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY` | LLM local |

Routes (authentification requise) : `GET /api/llm/providers`,
`POST /api/llm/generate`, `GET /api/llm/status/{task_id}`.

**Ajouter un fournisseur** : écrire une classe héritant de `Provider`
(`server/llm/base.py`), l'enregistrer dans `_BUILDERS`
(`server/llm/registry.py`), puis l'activer via `LLM_PROVIDER_PRIORITY`.

> État : **conception + socle fonctionnel** (routeur, quotas, 2 fournisseurs,
> tests). Non branché sur l'interface : l'existant n'est pas impacté.

---

## 6. Base de données (SQLAlchemy, plug-and-play)

La base est **optionnelle et branchable** : le reste du code ne dépend jamais de
son implémentation, seulement du contrat `UserStore`.

```
server/db/
  contract.py     # UserRecord + UserStore (contrat, sans dependance lourde)
  engine.py       # engine + SessionLocal, a partir de DATABASE_URL
  models.py       # User (id, username, email, password_hash, created_at)
  repository.py   # SqlAlchemyUserStore (implementation du contrat)
  json_store.py   # JsonUserStore (repli, comportement d'origine)
  seed.py         # import users.json -> base (une seule fois)
```

> Le contrat (`contract.py`) est volontairement **sans dépendance lourde** : il
> est chargé au démarrage, alors que SQLAlchemy ne l'est qu'au premier accès à
> la base (voir la section « Démarrage à froid »).

- **Par défaut** : `USER_STORE=sqlalchemy`, `DATABASE_URL=sqlite:///…/data/app.db`.
- **Repli** : `USER_STORE=json` réutilise le fichier `users.json` (aucune base).
- **Import automatique** : au démarrage, `init_db()` crée les tables puis importe
  les comptes de `users.json` s'ils n'existent pas encore → **les comptes
  existants (dont la démo) survivent**.
- **Ajouter une table** : définir un modèle dans `models.py` (héritant de
  `Base`). `init_db()` le créera automatiquement.
- **Écrire une requête** : injecter une session via la dépendance FastAPI
  `Depends(get_session)`.
- **Changer de base** : modifier `DATABASE_URL` (PostgreSQL, MySQL…). Pour des
  migrations évolutives, brancher **Alembic** (hors périmètre actuel).

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from server.db import get_session
from server.db.models import User

@router.get("/exemple")
def exemple(session: Session = Depends(get_session)):
    return session.query(User).count()
```

> ⚠️ Schéma volontairement minimal (créé par `create_all`) : suffisant pour une
> base simple, **à faire évoluer** (migrations, index, contraintes).

---

## 7. Comparatif avant / après

### Performance (mesures réelles)

Méthode : 120 requêtes séquentielles, 10 de chauffe, en localhost (Windows).
Avant = version Flask du dépôt (`app.py`, serveur de dev Werkzeug, threadé) ;
après = FastAPI sur **granian** (ASGI).

| Métrique | Avant (Flask) | Après (FastAPI) | Écart |
| --- | --- | --- | --- |
| `GET /login` — moyenne | 10,97 ms | **1,99 ms** | **÷5,5** |
| `GET /login` — p95 | 25,45 ms | **2,75 ms** | ÷9 |
| `GET /static/css/style.css` — moyenne | 13,89 ms | **5,17 ms** | ÷2,7 |
| Poids transféré `GET /login` | 9 453 o | **2 338 o** | **−75 %** (gzip) |
| Poids transféré `GET /static` | 42 399 o | **7 857 o** | **−81 %** (gzip) |
| Démarrage à froid | **579 ms** | 977 ms | +69 % (voir ci-dessous) |

### Démarrage à froid : diagnostic et optimisation

Le démarrage à froid était le seul point où la nouvelle version était **plus
lente**. Mesures à l'appui, la cause n'était ni la compilation bytecode (temps
identique à froid et à chaud) ni le serveur, mais **les imports de bibliothèques
tierces** : SQLAlchemy (~300 ms), `httpx` (~130 ms), `werkzeug` (~51 ms),
PyJWT. Un import dans un thread n'aide pas (le GIL sérialise).

Correctif appliqué : **chargement paresseux** — ces bibliothèques ne sont plus
importées au démarrage, seulement au premier besoin réel.

| Étape | Avant optimisation | Après optimisation |
| --- | --- | --- |
| Import de l'application | ~1 160 ms | **~620 ms** (−47 %) |
| Démarrage à froid (granian) | ~1 579 ms | **~977 ms** (−38 %) |

Bibliothèques effectivement **absentes du démarrage** : `sqlalchemy`, `httpx`,
`werkzeug`, `jwt` (vérifié par introspection de `sys.modules`). La base est
initialisée en arrière-plan, et l'import SQLAlchemy se fait au premier accès
réel à la base.

**Résidu honnête** : il reste ~400 ms d'écart avec Flask. Il est **structurel** :
- le paquet `fastapi` (avec Starlette + Pydantic) pèse ~419 ms à lui seul,
  contre ~282 ms pour `flask` ;
- le serveur ASGI coûte ~500 ms de démarrage sur Windows, contre ~120 ms pour
  le serveur de dev Werkzeug (mesuré avec une application ASGI minimale).

Autrement dit, **l'écart restant n'est pas dans notre code** : il vient du choix
de la pile ASGI. Le rejoindre totalement impliquerait d'abandonner FastAPI, ce
qui contredirait les autres objectifs (async, validation, multi-workers). À
noter : en conteneur Linux (Docker/Render), le coût de démarrage d'un process
est nettement plus faible que sur Windows, donc l'écart réel en production est
plus réduit.

**Honnêteté sur ces chiffres** : ce n'est pas une comparaison « serveur de prod
contre serveur de prod » (Werkzeug dev vs granian), ni un test de charge. Sur
localhost, ces valeurs sont **indicatives**.

### Les autres axes

| Axe | Avant (Flask monolithe) | Après (FastAPI modulaire) |
| --- | --- | --- |
| **Performance** | I/O bloquante, serveur de dev, pas de compression | Async (`httpx`), ASGI multi-workers, gzip, cache, ETag |
| **Qualité** | Pas de tests, pas de lint/typage | 106 tests, **87 %** de couverture, ruff + mypy + pylint 10/10 |
| **Sécurité** | Routes sensibles publiques, `debug=True`, `users.json` dans Git | Auth systématique, `debug` off, `SECRET_KEY` obligatoire, secrets hors dépôt |
| **Robustesse** | `except Exception` qui fuit `str(e)` | Erreurs typées (`KlingError`, `MailError`), handler global sans fuite |
| **Optimisation** | 1 requête = 1 lecture disque, pas de cache | Cache mémoire, gzip, cache HTTP, ETag, bytecode Jinja, imports paresseux |
| **Extensibilité** | Tout dans un fichier | Un module = une responsabilité, base branchable (SQLAlchemy) |
| **Maintenabilité** | 600 lignes couplées | Routeurs + services + docstrings, nommage explicite |

---

## 8. Porte qualité

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
ruff check . && ruff format --check .
mypy
pylint server scripts main.py external_api.py --fail-under=9.5
bandit -q -r server main.py external_api.py
python run_tests.py            # ou : pytest
```

| Étape | Résultat |
| --- | --- |
| `ruff check` | OK |
| `ruff format --check` | OK |
| `mypy` | 0 erreur |
| `pylint` | **10.00 / 10** |
| `bandit` | 3 alertes **Low** — justifiées : `import subprocess` + appel FFmpeg sans `shell`, chemin résolu via `shutil.which`, arguments fixes (pas d'injection) |
| `pytest` | **128 tests** (+ 1 test de charge), couverture **85 %** |

Trois exceptions de configuration sont documentées et justifiées dans
`pyproject.toml` :
- `good-names` : `SessionLocal` (nom conventionnel SQLAlchemy) et les états
  mutables de module `_store` / `_initialized` ;
- `import-outside-toplevel` désactivé : choix assumé du **chargement paresseux**
  des bibliothèques lourdes pour le démarrage à froid ;
- `wrong-import-position` désactivé dans `scripts/profile_app.py` (ajout de
  `backend/` au `sys.path` avant les imports).

---

## 9. Tests, qualité et outillage

### Lancer l'application

```bash
cd backend
uvicorn main:app --reload --port 5000                                      # developpement
granian --interface asgi --host 0.0.0.0 --port 5000 --workers 2 main:app   # production
uvicorn external_api:app --port 5001                                       # API externe (autre terminal)
```

Documentation interactive de l'API : `GET /api/docs`.

### Taxonomie des tests

Les tests sont rangés par catégorie (dossier = catégorie, marqueur appliqué
automatiquement) :

| Catégorie | Dossier | Ce qu'elle vérifie |
| --- | --- | --- |
| **Unitaire** | `tests/unit/` | Une fonctionnalité isolée, dépendances mockées |
| **Intégration** | `tests/integration/` | Plusieurs composants ensemble (routes + services) |
| **Fonctionnel** | `tests/functional/` | Parcours utilisateur complet, conforme aux spécifications |
| **Non-régression** | `tests/regression/` | Un comportement figé ne régresse pas (ex. bug `pathsend`) |
| **Performance / charge** | `tests/performance/` | Débit et percentiles sous concurrence (exclus par défaut) |

```bash
python run_tests.py            # toute la suite (performance exclue)
pytest -m unit                 # une seule categorie
pytest -m performance          # tests de charge
```

Le **mocking** se fait via les fixtures `monkeypatch` de pytest et des doublures
maison (`tests/helpers.py` : `FakeClient`, `FakeResponse`), plutôt que par des
appels réseau réels.

### Profilage et charge

```bash
python scripts/profile_app.py --url /login --top 20   # ou passe le temps (cProfile)
python scripts/profile_app.py --snakeviz              # rapport visuel SnakeViz
python scripts/load_test.py --url http://localhost:5000/login --requests 500 --concurrency 25
```

### Documentation technique (Sphinx)

```bash
pip install -r requirements-dev.txt
sphinx-build -b html docs docs/_build/html   # -> docs/_build/html/index.html
```

La documentation est générée depuis les docstrings (autodoc + napoleon, style
Google). Voir `docs/`.

### Packaging réutilisable

`pyproject.toml` déclare le paquet (`goldfx-backend`) et ses dépendances :
`pip install -e .` depuis `backend/` rend le paquet installable et réutilisable
dans une autre application.

---

## 10. Principes de conception

- **KISS** — la solution la plus simple possible ; interfaces minimales
  (`Provider`, `UserStore`), pas de machinerie inutile.
- **YAGNI** — pas de code pour des cas hypothétiques ni de « câbles
  débranchés » ; on ajoute une brique quand elle sert.
- **Moindre surprise** — un comportement attendu : `import media` ne masque pas
  un module standard (d'où `media_tools`), `scripts/profile_app.py` n'entre pas
  en collision avec le module standard `profile`.
- **Compartimentalisation** — « on ne parle pas aux étrangers » : les routeurs
  ne connaissent que les interfaces des services, jamais leurs détails
  (`db` expose `UserStore`, `llm` expose `Provider`).

---

## 11. Conventions (pour humains et LLM)

### Nommage (PEP 8)

- `minuscules_avec_underscore` : fonctions, variables, modules, fichiers.
- `CamelCase` : classes (`UserStore`, `KlingProvider`, `TTLCache`).
- `MAJUSCULES` : constantes de module (`MAX_UPLOAD_MB`, `_TEXTUAL_CONTENT_TYPES`).
- `_prefixe` : tout ce qui est privé (`_store`, `_ext`, `_send_sync`).
- Longueur de ligne : 100 caractères (configuré dans `ruff` et `pylint`).

### Structure

- **Un module = une responsabilité**, nommé par ce qu'il fait (`caching`,
  `security`, `db`, `media_tools`, `llm`…).
- **Chaque module commence par une docstring** d'une ligne décrivant son rôle ;
  chaque fonction publique a une docstring (style Google).
- **Routeurs** : un fichier par domaine (`auth`, `pages`, `media`, `kling`, `llm`).
- **Services** : logique métier et I/O hors des routeurs.
- **Configuration** : tout passe par `config.py` (jamais de valeur en dur).
- **Visibilité** : déclarée dans `__all__` des paquets (`server/db`, `server/llm`).
- **Tests** : rangés par catégorie (dossier), fixtures dans `tests/conftest.py`,
  doublures dans `tests/helpers.py`.
- **Documentation** : `README.md` (ce fichier) + `docs/` (Sphinx).
- **Code et commentaires en français**, cohérents avec le reste du projet.

### Ajouter une brique

| Objectif | Où intervenir |
| --- | --- |
| Nouvelle route HTTP | `server/routers/<domaine>.py` + `create_app()` |
| Nouvelle table | `server/db/models.py` (créée par `init_db()`) |
| Nouveau fournisseur de modèle | `server/llm/<provider>.py` + `_BUILDERS` |
| Nouveau type de test | dossier `tests/<categorie>/` (marqueur automatique) |
