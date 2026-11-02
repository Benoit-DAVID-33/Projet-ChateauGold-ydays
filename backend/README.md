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

**Règle de lecture** : un dossier = une responsabilité, un fichier de `api/` =
un préfixe d'URL. Les imports sont **absolus** (`from server.video_editing import
catalog`) : on sait toujours d'où vient un symbole. Chaque `__init__.py` et
chaque module commence par une docstring qui dit ce qu'il contient.

```
backend/
├── main.py                     # Point d'entrée ASGI : app = create_app()
├── external_api.py             # Service externe de démo (FastAPI, port 5001)
├── server/
│   ├── __init__.py             # create_app() : middleware, routeurs, erreurs
│   ├── config.py               # Toute la configuration (variables d'environnement)
│   ├── api/                    # ROUTES HTTP — un fichier par préfixe d'URL
│   │   ├── __init__.py         # all_routers() + tableau fichier → préfixe
│   │   ├── auth.py             # /login, /register, /logout
│   │   ├── pages.py            # /, /video, /image, /studio, /offres...
│   │   ├── media.py            # /upload (en flux), /videos, /images, /api/videos
│   │   ├── kling.py            # /kling/* (accès direct Kling, conversion auto du prompt)
│   │   ├── video_edits.py      # /api/video-edits/* (plan, travaux, fichiers à jeton)
│   │   ├── prompts.py          # /api/prompt/* (tri, enhance, chat, models)
│   │   ├── proxy.py            # /api/llm/* (proxy LLM multi-fournisseurs)
│   │   ├── plans.py            # /api/plans/* (offres, demande Studio)
│   │   ├── emoji.py            # /api/emoji/*
│   │   ├── admin.py            # /admin, /api/admin/* (actions réservées à ADMIN_USERS)
│   │   └── schemas.py          # Corps de requête validés (Pydantic)
│   ├── core/                   # BRIQUES TRANSVERSES
│   │   ├── caching.py          # TTLCache, gzip sélectif, cache statique
│   │   ├── http_clients.py     # Clients httpx partagés (pool keep-alive) + close_all
│   │   ├── request_context.py  # X-Request-ID + Server-Timing (ASGI pur)
│   │   ├── auth_deps.py        # require_user / require_user_page / require_admin
│   │   ├── templating.py       # Rendu Jinja2 + ETag
│   │   └── forms.py            # Lecture typée des formulaires
│   ├── accounts/               # COMPTES ET OFFRES
│   │   ├── users.py            # Hachage, authentification, cache
│   │   ├── plans.py            # Offres Découverte / Studio (limites appliquées)
│   │   └── usage.py            # Offre souscrite, quota du jour (réservation atomique)
│   ├── db/                     # PERSISTANCE SQLAlchemy (modèles, repository, seed)
│   ├── integrations/           # CLIENTS D'API EXTERNES
│   │   ├── kling_api.py        # Kling (JWT, erreurs typées, réessais)
│   │   ├── processing_api.py   # API de traitement de démo
│   │   └── mailer.py           # SMTP dans un thread
│   ├── media/                  # FICHIERS MÉDIAS
│   │   ├── files.py            # Extensions, MIME, chemins sûrs
│   │   └── ffmpeg.py           # Sonde (cache), découpe, normalisation, assemblage, audio
│   ├── prompts/                # PROMPT ENGINEERING
│   │   ├── timecodes.py        # « à 2 s », « de 3 à 5 s », « jusqu'à la fin »
│   │   ├── cinema.py           # Jargon de tournage FR → EN (travelling, contre-plongée...)
│   │   ├── lexicon.py          # Traduction FR → EN hors ligne
│   │   ├── triage.py           # Tri : modifications, moments, intentions, questions
│   │   ├── enhancer.py         # Prompt par modèle (règles + LLM gratuit guidé par le tri)
│   │   └── chat.py             # Assistant de plateau (chatbot)
│   ├── proxy/                  # PROXY LLM (gratuit uniquement par défaut)
│   │   ├── contract.py         # Contrat Provider
│   │   ├── router.py           # Sélection, repli, santé parallèle mise en cache
│   │   ├── quotas.py           # Quotas quotidiens persistés
│   │   ├── openai_compatible.py# local, OpenRouter, Groq, Gemini, HF (garde-fou compte)
│   │   ├── kling_generation.py # Génération Kling via le proxy
│   │   └── registry.py         # Construction depuis la configuration
│   ├── video_editing/          # ÉDITION VIDÉO PAR IA
│   │   ├── catalog.py          # Fiches modèles : formats, qualités, prix, preuves
│   │   ├── routing.py          # Choix du modèle le plus cohérent (expliqué)
│   │   ├── planner.py          # Plan : segments, contexte, morceaux, coût
│   │   ├── providers/          # Adaptateurs : kling.py, fal.py, decart.py, luma.py
│   │   ├── jobs.py             # Travaux persistés + file prioritaire
│   │   ├── pipeline.py         # Découpe → édition → assemblage → audio d'origine
│   │   └── service.py          # Orchestration : offre, tri, plan, prompts, quota
│   └── emoji/                  # Studio emoji backend
├── scripts/
│   ├── generate_model_specs.py # Génère docs/specs_modeles.md depuis le catalogue
│   ├── profile_app.py          # Profilage cProfile (+ SnakeViz)
│   └── load_test.py            # Test de charge
├── tests/                      # unit/ integration/ functional/ regression/ performance/
└── docs/                       # Sphinx + specs_modeles.md + veille
```

### Flux d'une requête

```
Client
  │
  ▼
[ X-Request-ID / Server-Timing ] → [ GZip sélectif ] → [ Cache statique ] → [ Session ] → [ Limite upload ]
  │
  ▼
server/api/<prefixe>.py   (validation Pydantic + require_user / require_admin)
  │
  ▼
Service métier (video_editing.service, prompts.*, proxy.router, accounts.usage)
  │  └─ Caches : santé des fournisseurs (30 s), réponses LLM (10 min), sonde FFmpeg, ETag
  ▼
Intégrations (kling_api, providers/*, ffmpeg) — clients HTTP partagés, flux disque
```

### Optimisations de cette version

| Domaine | Changement | Effet |
| --- | --- | --- |
| Réseau | Proxy LLM : client httpx **partagé** par fournisseur (pool keep-alive) au lieu d'un client par requête | plus de poignée de main TLS à chaque prompt |
| Réseau | Adaptateurs vidéo : 3 essais sur 429/5xx avec `Retry-After`, suivi à intervalle croissant | moins d'échecs transitoires, moins d'appels de suivi |
| Mémoire | Upload et téléchargements (Kling, fournisseurs) **en flux** par blocs de 1 Mo | un fichier de 500 Mo n'est jamais chargé en RAM |
| Cache | Santé des fournisseurs vérifiée **en parallèle** et gardée 30 s ; réponses LLM 10 min ; sonde FFmpeg (clé = taille + date) ; `ETag` + 304 sur le catalogue | console et studio plus réactifs |
| Cache | Résultat Kling déjà téléchargé : pas de second transfert à chaque suivi | bande passante économisée |
| Qualité | Découpes à l'image près (H.264 CRF 17), segments normalisés, audio d'origine conservé | montage sans saut ni décalage son |
| Observabilité | `X-Request-ID` et `Server-Timing` sur chaque réponse, journal des requêtes lentes | diagnostic sans outil externe |
| Industrialisation | Imports absolus, un dossier par responsabilité, catalogue unique → doc générée et vérifiée par un test | le code et la doc ne peuvent plus diverger |

### Édition vidéo à des moments précis (`server/video_editing`)

« À la 2e seconde intègre un chevalier, puis à 15 s rajoute un dragon » :

1. **Tri** (`prompts.triage`) : 2 modifications, intention « add », débuts 2 s et 15 s
   (sans fin précisée : jusqu'à la fin de la vidéo, hypothèse affichée).
2. **Routage** (`routing`) : pour chaque modification, le modèle le plus cohérent
   parmi ceux réellement configurés — points forts, durée acceptée, qualité demandée
   (jamais remplacée par une plus chère, ramenée à l'inférieure seulement si aucun
   modèle ne la fournit), coût (un prix non publié est estimé au plus cher connu).
3. **Plan** (`planner`) : `[0–2 s] conservé · [2–15 s] chevalier · [15 s–fin] chevalier
   puis dragon`. Segment trop court → rendu avec contexte puis recoupé ; trop long →
   morceaux, l'image de fin du précédent servant de référence de continuité.
4. **Exécution** (`pipeline`) : découpe à l'image près, une génération par
   modification, normalisation à la taille et à la cadence de la source, assemblage
   sans ré-encodage, **piste audio d'origine** remise sur toute la durée.

`POST /api/video-edits/preview` montre tout cela **sans aucun appel payant** ;
`POST /api/video-edits` réserve le quota (atomique) et met le travail en file
(priorité Studio). Un appel n'est décompté qu'une fois accepté par le fournisseur ;
les générations non envoyées sont rendues en cas d'échec ou d'annulation.
`VIDEO_EDITING_SIMULATE=true` exécute toute la chaîne sans IA ni coût (démo).

### Démonstration gratuite (Space Hugging Face)

L'offre Découverte passe par le Space **JoyAI Video Edit** (Apache-2.0), appelé **sans
jeton** : aucun compte Hugging Face utilisé ni débité. Quota GPU anonyme suivi localement
(`HF_SPACE_DAILY_GPU_SECONDS`), passages de 4 s maximum, sortie complétée à la durée exacte.
Détails et mesures : `docs/apis_gratuites.md` (section 6).

### Offres (`server/accounts`)

| | Découverte (gratuite) | Studio |
| --- | --- | --- |
| Générations / jour | `PLAN_FREE_DAILY_GENERATIONS` (2) | `PLAN_STUDIO_DAILY_GENERATIONS` (30) |
| Qualités | Brouillon, Standard | jusqu'à 4K (selon le modèle) |
| Modifications / vidéo · durée | 2 · 30 s | 8 · 180 s |
| Plafond de coût par vidéo | 1,50 $ | 25 $ |
| File de traitement | normale | prioritaire |

Chaque avantage affiché sur `/offres` est une limite appliquée par le code. Le
paiement en ligne n'est **pas** intégré : `POST /api/plans/upgrade-request`
enregistre la demande, un compte listé dans `ADMIN_USERS` l'active.

### Prompt engineering : tri puis LLM

Approche retenue (et implémentée) : un **tri déterministe** avant tout LLM
(`prompts.triage` : découpage, moments, intention, jargon cinéma, questions),
puis un **LLM gratuit** qui ne fait que reformuler, guidé par le tri et un
exemple. Le code garantit la structure (un prompt par modification, référence
`<<<video_1>>>` / `@Video1`, moments retirés du texte) et rejette une réponse
incohérente. Un modèle de **raisonnement** gratuit (`openai/gpt-oss-120b` sur
Groq, `GROQ_API_KEY`) donne les meilleures reformulations ; en local, un modèle
instruct de 8 à 14 B (Ollama) suffit, car le jargon est déjà traduit par
`prompts.cinema`. Il n'existe pas de LLM local « spécialisé cinéma » fiable : le
glossaire injecté joue ce rôle. Sans LLM, les règles restent disponibles.

---

## 3. Cache & performance

Les pages sont **personnalisées** (nom et email de l'utilisateur) : un cache
HTML *partagé* serait donc un bug de sécurité. On cache ce qui est cacheable et
on rend le reste **revalidable**. Honnêtement : le vrai coût n'était pas le
rendu Jinja (déjà mis en cache en mémoire), mais une **lecture disque à chaque
requête**.

| Mécanisme | Fichier | Ce que ça apporte |
| --- | --- | --- |
| **Cache utilisateurs** (TTL) | `accounts/users.py` + `core/caching.py` | Évite de relire `users.json` / la base à chaque affichage de page |
| **GZip sélectif** | `caching.py` | Compresse HTML/CSS/JS/JSON, **jamais** les médias (préserve les requêtes HTTP Range de la vidéo) |
| **Cache-Control statique** | `caching.py` | `public, max-age=1 an, immutable` sur `/static/*` |
| **Cache-Control médias** | `api/media.py` | `private, max-age=1 h` sur `/images/*` et `/videos/*` |
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

Le proxy vit dans `server/proxy/` et **ne remplace pas** `/kling/*` : il ajoute un
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
2. **configuration** — sans clé / URL, il est ignoré (aucun appel inutile) ;
3. **gratuité** — avec `LLM_FREE_ONLY=true` (**défaut**), seuls les
   fournisseurs gratuits servent : aucun compte (Hugging Face, Kling, MiniMax)
   ne peut être débité par le proxy ;
4. **quota** — on écarte ceux ayant atteint leur limite **du jour** (`LLM_QUOTAS`,
   remise à zéro quotidienne, compteurs persistés dans `LLM_QUOTA_FILE`) ;
5. **priorité** — ordre de `LLM_PROVIDER_PRIORITY` ;
6. **cohérence** — une tâche déjà confiée reste chez son fournisseur (le suivi
   ne change pas de fournisseur en cours de route) ;
7. **repli** — si le fournisseur échoue, on essaie le suivant.

**Un adaptateur pour plusieurs services** : `OpenAICompatibleProvider` parle
l'API `/chat/completions`, exposée par Hugging Face (routeur d'inférence),
MiniMax, vLLM, Ollama… Changer de service = changer trois variables d'env.

| Variable | Rôle |
| --- | --- |
| `LLM_PROVIDER_PRIORITY` | Ordre (défaut `local,openrouter,groq,gemini,huggingface,kling,minimax`) |
| `LLM_FREE_ONLY` | `true` (défaut) : fournisseurs gratuits uniquement |
| `LLM_QUOTAS`, `LLM_QUOTA_FILE` | Quotas quotidiens (ex. `openrouter=45,groq=900`) et leur fichier |
| `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY` | LLM local — **gratuit** |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | OpenRouter — gratuit **seulement** avec un modèle `:free` |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FREE_TIER` | Groq — palier gratuit |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FREE_TIER` | Gemini — palier gratuit |
| `HF_API_TOKEN`, `HF_MODEL`, `HF_FORBIDDEN_ACCOUNTS`, `HF_EXPECTED_ACCOUNT`, `HF_BILL_TO` | Hugging Face — **payant** (facturé au propriétaire du jeton) |
| `MINIMAX_API_BASE_URL`, `MINIMAX_MODEL`, `MINIMAX_API_KEY` | MiniMax (texte) — payant |

Routes (authentification requise) : `GET /api/llm/providers`,
`POST /api/llm/generate`, `GET /api/llm/status/{task_id}`.

**Hugging Face n'est pas gratuit** : un compte gratuit n'a aucun crédit
d'inférence et chaque requête routée est facturée au propriétaire du jeton. Le
fournisseur `huggingface` est donc écarté par défaut ; s'il est réactivé, le
propriétaire du jeton est vérifié (`whoami-v2`) contre `HF_FORBIDDEN_ACCOUNTS` /
`HF_EXPECTED_ACCOUNT` avant tout appel. Seul `HF_API_TOKEN` est lu (jamais
`HF_TOKEN` ni le cache de `huggingface-cli login`). Détails :
`docs/apis_gratuites.md`.

**Ajouter un fournisseur** : écrire une classe héritant de `Provider`
(`server/proxy/base.py`), l'enregistrer dans `_BUILDERS`
(`server/proxy/registry.py`), puis l'activer via `LLM_PROVIDER_PRIORITY`.

> État : **conception + socle fonctionnel** (routeur, quotas, fournisseurs,
> tests). Non branché sur l'interface : l'existant n'est pas impacté.

---

## 6. Emoji, console d'administration et prompt engineering

Le studio emoji du projet (`docs/emoji-studio.html`) est un outil **client-side**.
Le backend en réimplémente la logique pour la rendre réutilisable via une API,
sans rendu image côté serveur : `POST /api/emoji/plan` renvoie un **plan de
calques JSON** (positions, tailles, rotations) que le navigateur dessine sur
canvas.

| Route | Rôle |
| --- | --- |
| `GET /api/emoji/search?q=&limit=` | Recherche bilingue (labels + tags + alias FR/EN) |
| `POST /api/emoji/plan` | Analyse une composition (« 2 voitures et un avion ») → plan |
| `GET /api/emoji/dataset` | Page du jeu emojibase (métadonnées) |

- **Données** : emojibase FR/EN via CDN, mises en cache (TTL long) ; un fichier
  local (`EMOJI_DATA_FILE`) court-circuite le réseau. Chargées **à la demande**
  (jamais au démarrage).
- **Déterminisme** : `seed` fixe ⇒ même plan (PRNG mulberry32 identique au studio).
- **Variables** : `EMOJI_DATA_URLS`, `EMOJI_DATA_FILE`, `EMOJI_CACHE_TTL`,
  `EMOJI_MAX_RESULTS`.

### Console d'administration (`/admin`)

Page autonome (`frontend/templates/admin.html` + `static/css/admin.css` +
`static/js/admin.js`) : thème sombre, accents dorés, **motion design** (aurore
animée, apparitions en cascade, compteurs animés, pastilles d'état pulsées,
barres de quota), `prefers-reduced-motion` respecté.

Elle affiche : version, disponibilité, KPI (utilisateurs, vidéos, images,
emojis), fournisseurs de modèles (capacités, joignabilité, quota), configuration
(non sensible), le studio de prompt et le studio emoji (recherche dans **tous**
les emojis, plan de calques et aperçu canvas).

| Route | Rôle |
| --- | --- |
| `GET /admin` | Page de la console (auth requise) |
| `GET /api/admin/overview` | État complet en une requête (auth requise) |

### Prompt engineering (`/api/prompt/enhance`, `/api/prompt/models`)

Transforme une demande **naturelle et parfois vague** en prompt(s) structuré(s)
pour un modèle vidéo→vidéo : `kling`, `runway`, `luma`, `decart`, `seedance`,
`xai`, `wan`, `generic` (fiches dans `server/prompts/enhancer.py`, sources dans
`docs/modeles_video_a_video.md`).

- **Découpage multi-modifications** : « enlève le logo **et** mets de la neige »
  → `steps` = 2 prompts (un par génération).
- **Intention** par étape (ajouter / retirer / remplacer / recolorer / restyler /
  fond / météo / lumière / angle / plan suivant ou précédent).
- **Traduction FR → EN hors ligne** (`server/prompts/lexicon.py`) : les modèles
  suivent mieux l'anglais ; si un mot est inconnu, le prompt reste en français
  (`translated: false`) plutôt que de mélanger les langues.
- **Gabarit par modèle** : `<<<video_1>>>` pour Kling Omni, mot déclencheur pour
  Decart / Seedance, description du résultat pour Luma, clause « Keep …
  unchanged » seulement quand le modèle en tire profit ; enrichissement
  (intégration, lumière, cohérence temporelle), `negative_prompt` et `params`
  conseillés (`refer_type` Kling, `strength` Luma).
- **Mode LLM** (`use_llm`) : réécriture par un fournisseur **gratuit**, en JSON,
  guidée par la fiche du modèle et le brouillon par règles ; repli automatique.
- **Conversion automatique** sur `POST /kling/omni-video` (`PROMPT_AUTO_ENHANCE`,
  défaut `true`, ou `"auto_prompt": false` par requête) : le prompt réellement
  envoyé est renvoyé dans `prompt_conversion` ; un prompt déjà structuré
  (`<<<video_1>>>`) est envoyé tel quel.

> Méthode recommandée : LLM pour la reformulation + règles pour garantir la
> structure et le repli hors ligne. Voir aussi `docs/apis_gratuites.md`.

---

## 7. Base de données (SQLAlchemy, plug-and-play)

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

## 8. Comparatif avant / après

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

## 9. Porte qualité

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
| `pytest` | **190 tests** (+ 1 test de charge), couverture **85 %** |

Trois exceptions de configuration sont documentées et justifiées dans
`pyproject.toml` :
- `good-names` : `SessionLocal` (nom conventionnel SQLAlchemy) et les états
  mutables de module `_store` / `_initialized` ;
- `import-outside-toplevel` désactivé : choix assumé du **chargement paresseux**
  des bibliothèques lourdes pour le démarrage à froid ;
- `wrong-import-position` désactivé dans `scripts/profile_app.py` (ajout de
  `backend/` au `sys.path` avant les imports).

---

## 10. Tests, qualité et outillage

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
Google). Voir `docs/`. Documents complémentaires :

- `docs/veille_verification.md` — vérification de la veille vidéo→vidéo face aux
  sources officielles (statut par affirmation).
- `docs/apis_gratuites.md` — providers d'inférence et quotas gratuits vérifiés
  (Wan 2.2, MiniMax-H3, LLM texte).

### Packaging réutilisable

`pyproject.toml` déclare le paquet (`goldfx-backend`) et ses dépendances :
`pip install -e .` depuis `backend/` rend le paquet installable et réutilisable
dans une autre application.

---

## 11. Principes de conception

- **KISS** — la solution la plus simple possible ; interfaces minimales
  (`Provider`, `UserStore`), pas de machinerie inutile.
- **YAGNI** — pas de code pour des cas hypothétiques ni de « câbles
  débranchés » ; on ajoute une brique quand elle sert.
- **Moindre surprise** — un comportement attendu : `import media` ne masque pas
  un module standard (d'où `media/files.py`), `scripts/profile_app.py` n'entre pas
  en collision avec le module standard `profile`.
- **Compartimentalisation** — « on ne parle pas aux étrangers » : les routeurs
  ne connaissent que les interfaces des services, jamais leurs détails
  (`db` expose `UserStore`, `llm` expose `Provider`).

---

## 12. Conventions (pour humains et LLM)

### Nommage (PEP 8)

- `minuscules_avec_underscore` : fonctions, variables, modules, fichiers.
- `CamelCase` : classes (`UserStore`, `KlingProvider`, `TTLCache`).
- `MAJUSCULES` : constantes de module (`MAX_UPLOAD_MB`, `_TEXTUAL_CONTENT_TYPES`).
- `_prefixe` : tout ce qui est privé (`_store`, `_ext`, `_send_sync`).
- Longueur de ligne : 100 caractères (configuré dans `ruff` et `pylint`).

### Structure

- **Un module = une responsabilité**, nommé par ce qu'il fait (`caching`,
  `accounts`, `db`, `media`, `proxy`…).
- **Chaque module commence par une docstring** d'une ligne décrivant son rôle ;
  chaque fonction publique a une docstring (style Google).
- **Routeurs** : un fichier par domaine (`auth`, `pages`, `media`, `kling`, `llm`).
- **Services** : logique métier et I/O hors des routeurs.
- **Configuration** : tout passe par `config.py` (jamais de valeur en dur).
- **Visibilité** : déclarée dans `__all__` des paquets (`server/db`, `server/proxy`).
- **Tests** : rangés par catégorie (dossier), fixtures dans `tests/conftest.py`,
  doublures dans `tests/helpers.py`.
- **Documentation** : `README.md` (ce fichier) + `docs/` (Sphinx).
- **Code et commentaires en français**, cohérents avec le reste du projet.

### Ajouter une brique

| Objectif | Où intervenir |
| --- | --- |
| Nouvelle route HTTP | `server/api/<prefixe>.py` + `all_routers()` (`server/api/__init__.py`) |
| Nouvelle table | `server/db/models.py` (créée par `init_db()`) |
| Nouveau fournisseur de modèle | `server/proxy/<provider>.py` + `_BUILDERS` |
| Nouveau type de test | dossier `tests/<categorie>/` (marqueur automatique) |
