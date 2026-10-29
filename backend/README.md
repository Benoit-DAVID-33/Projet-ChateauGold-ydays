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
│   │   ├── engine.py       # Moteur + fabrique de sessions (DATABASE_URL)
│   │   ├── models.py       # Modeles SQLAlchemy (User)
│   │   ├── repository.py   # Contrat UserStore + impl. SQLAlchemy
│   │   ├── json_store.py   # Impl. fichier JSON (repli / tests)
│   │   └── seed.py         # Import users.json -> base
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
│       └── kling.py        # Proxy Kling AI
├── tests/                  # Suite pytest (100 tests)
├── requirements.txt        # Dependances d'execution
├── requirements-dev.txt    # Outils qualite (pytest, ruff, mypy, bandit, pylint)
└── pyproject.toml          # Config ruff / mypy / pylint / coverage / pytest
```

**Règle de lecture** : le nom du fichier dit la responsabilité.
`caching` = cache, `security` = utilisateurs, `db` = base, `routers/*` = HTTP.
Aucun fichier ne mélange deux responsabilités.

### Flux d'une requête

```
Client
  │
  ▼
[ GZip selectif ] → [ Cache statique ] → [ Session signee ] → [ Limite upload ]
  │
  ▼
Routeur (auth / pages / media / kling)
  │  └─ Dependance d'auth : require_user (401) ou require_user_page (redirect)
  ▼
Service (security, kling, media_tools, mailer, db)
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

## 5. Base de données (SQLAlchemy, plug-and-play)

La base est **optionnelle et branchable** : le reste du code ne dépend jamais de
son implémentation, seulement du contrat `UserStore`.

```
server/db/
  engine.py       # engine + SessionLocal, a partir de DATABASE_URL
  models.py       # User (id, username, email, password_hash, created_at)
  repository.py   # UserStore (ABC) + SqlAlchemyUserStore
  json_store.py   # JsonUserStore (repli, comportement d'origine)
  seed.py         # import users.json -> base (une seule fois)
```

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

## 6. Comparatif avant / après

### Performance (mesures réelles)

Méthode : 120 requêtes séquentielles, 10 de chauffe, en localhost (Windows).
Avant = version Flask du dépôt (`app.py`, serveur de dev Werkzeug, threadé) ;
après = FastAPI sur Uvicorn (1 worker).

| Métrique | Avant (Flask) | Après (FastAPI) | Écart |
| --- | --- | --- | --- |
| `GET /login` — moyenne | 14,13 ms | **1,18 ms** | **÷12** |
| `GET /login` — p95 | 20,56 ms | **1,64 ms** | ÷13 |
| `GET /static/css/style.css` — moyenne | 14,16 ms | **2,84 ms** | ÷5 |
| Poids transféré `GET /login` | 9 453 o | **2 338 o** | **−75 %** (gzip) |
| Poids transféré `GET /static` | 42 399 o | **7 857 o** | **−81 %** (gzip) |
| Démarrage à froid | 1 172 ms | 1 579 ms | +35 % (imports en plus : SQLAlchemy…) |

**Honnêteté sur ces chiffres** : ce n'est pas une comparaison « serveur de prod
contre serveur de prod » (Werkzeug dev vs Uvicorn), ni un test de charge. Sur
localhost, en une passe, ces valeurs sont **indicatives**. Le gain de latence
vient surtout de l'ASGI + gzip + cache ; le surcoût de démarrage vient du nombre
de dépendances importées. En production, remplacer Uvicorn par **granian**
(`--workers N`) ajoute le parallélisme multi-processus.

### Les autres axes

| Axe | Avant (Flask monolithe) | Après (FastAPI modulaire) |
| --- | --- | --- |
| **Performance** | I/O bloquante, serveur de dev, pas de compression | Async (`httpx`), ASGI multi-workers, gzip, cache, ETag |
| **Qualité** | Pas de tests, pas de lint/typage | 100 tests, **89 %** de couverture, ruff + mypy + pylint 10/10 |
| **Sécurité** | Routes sensibles publiques, `debug=True`, `users.json` dans Git | Auth systématique, `debug` off, `SECRET_KEY` obligatoire, secrets hors dépôt |
| **Robustesse** | `except Exception` qui fuit `str(e)` | Erreurs typées (`KlingError`, `MailError`), handler global sans fuite |
| **Optimisation** | 1 requête = 1 lecture disque, pas de cache | Cache mémoire, gzip, cache HTTP, bytecode Jinja |
| **Extensibilité** | Tout dans un fichier | Un module = une responsabilité, base branchable (SQLAlchemy) |
| **Maintenabilité** | 600 lignes couplées | Routeurs + services + docstrings, nommage explicite |

---

## 7. Porte qualité

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
ruff check . && ruff format --check .
mypy
pylint server main.py external_api.py --fail-under=9.5
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
| `pytest` | **100 tests**, couverture **89 %** |

Une exception de configuration est documentée dans `pyproject.toml`
(`good-names = ["SessionLocal"]`) : c'est le nom conventionnel SQLAlchemy, pas
un contournement.

---

## 8. Démarrage et tests

```bash
# Application (ASGI)
cd backend
uvicorn main:app --reload --port 5000          # developpement
granian --interface asgi --host 0.0.0.0 --port 5000 --workers 2 main:app   # production

# API externe de demo (autre terminal)
uvicorn external_api:app --port 5001

# Tests + qualite
python run_tests.py
```

Documentation interactive de l'API : `GET /api/docs`.

---

## 9. Conventions (pour humains et LLM)

- **Un module = une responsabilité**, nommé par ce qu'il fait (`caching`,
  `security`, `db`, `media_tools`…).
- **Chaque module commence par une docstring** d'une ligne décrivant son rôle ;
  chaque fonction publique a une docstring.
- **Routeurs** : un fichier par domaine (`auth`, `pages`, `media`, `kling`).
- **Services** : logique métier et I/O hors des routeurs.
- **Configuration** : tout passe par `config.py` (jamais de valeur en dur).
- **Tests** : un fichier `test_<module>.py` par module ; fixtures dans
  `tests/conftest.py`, doublures dans `tests/helpers.py`.
- **Code et commentaires en français**, cohérents avec le reste du projet.
