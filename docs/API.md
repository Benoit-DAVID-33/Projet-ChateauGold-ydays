# Référence de l'API

Base : `/api`, sur la même origine que le frontend. Le contrat exact (schémas, types) est
`backend/openapi.json`, généré par `make openapi` ; en développement, la documentation
interactive est servie sur `/api/docs`.

## Conventions

**Authentification.** Session par cookie `goldfx_session` (HttpOnly, Secure, SameSite=Lax),
obtenu par `POST /api/auth/login`. Toutes les routes exigent une session, sauf : santé,
`/api/auth/csrf`, `/api/auth/login`, `/api/auth/register`, `/api/auth/logout` (sans effet
sans session) et les liens publics signés ; en développement, aussi `/api/docs` et
`/api/openapi.json`.

**Protection CSRF.** Toute requête d'écriture (`POST`, `PUT`, `DELETE`) sur `/api` doit porter
l'en-tête `X-CSRF-Token` égal au cookie `goldfx_csrf`. Le cookie est fourni par
`GET /api/auth/csrf` et renouvelé à chaque connexion. Sans en-tête valide : `403 csrf_failed`.

**Format des erreurs.** Toutes les erreurs ont la forme :

```json
{ "error": { "code": "not_found", "message": "Média introuvable" } }
```

| HTTP | `code` | Cas |
|---|---|---|
| 401 | `authentication_failed` | session absente, expirée, identifiants incorrects, lien signé invalide |
| 403 | `csrf_failed` | jeton CSRF manquant ou différent |
| 404 | `not_found` | ressource absente **ou appartenant à un autre utilisateur** |
| 409 | `conflict` | nom d'utilisateur ou email déjà pris |
| 413 | `payload_too_large` | fichier ou graphe trop volumineux |
| 415 | `unsupported_media_type` | format de fichier refusé (dont SVG) |
| 422 | `validation_error` | champ invalide (le message indique lequel) |
| 429 | `rate_limited` | trop de tentatives de connexion, quota Kling, conversions saturées |
| 502 | `external_service_error` | échec de Kling, du service de traitement, de ffmpeg ou du SMTP |
| 503 | `not_configured` | fonctionnalité appelée sans sa configuration (Kling, URL publique, destinataire de contact) |

**Identifiants.** UUID. **Dates.** ISO 8601 en UTC.

## Santé

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/health` | Le processus répond : `{"status":"ok","version":"2.0.0"}`. |
| GET | `/api/health/ready` | La base de données répond ; `503` sinon. Utilisé par les sondes de disponibilité. |

## Authentification

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| GET | `/api/auth/csrf` | aucun | `{"csrf_token": "..."}` et cookie `goldfx_csrf` |
| POST | `/api/auth/register` | `{"username", "email", "password"}` | `201` utilisateur |
| POST | `/api/auth/login` | `{"identifier", "password"}` (nom d'utilisateur ou email) | `200` utilisateur + cookie de session |
| POST | `/api/auth/logout` | aucun | `204`, session supprimée |
| GET | `/api/auth/me` | aucun | utilisateur courant |

Règles d'inscription : nom d'utilisateur de 3 à 32 caractères (lettres, chiffres, `_`, `-`, `.`),
insensible à la casse ; email valide et unique ; mot de passe d'au moins
`GOLDFX_PASSWORD_MIN_LENGTH` caractères.

Utilisateur : `{"id", "username", "email", "created_at"}`.

## Médias

Un média appartient à son créateur. Son type est détecté à partir du contenu du fichier, jamais
de l'extension.

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/api/media` | Upload multipart : champ `file`. Pour un export de l'éditeur : `as_export=true` et `parent_id=<média d'origine>`. Réponse `201`. |
| GET | `/api/media?kind=&parent_id=&limit=&offset=` | Bibliothèque, du plus récent au plus ancien. `kind` : `image` ou `video` ; `parent_id` : dérivés de ce média seulement ; `limit` 1 à 200 (défaut 50), `offset` pour les pages suivantes. |
| GET | `/api/media/{id}` | Métadonnées. |
| GET | `/api/media/{id}/content?download=` | Contenu binaire. Gère les requêtes `Range` (lecture vidéo). `download=true` force le téléchargement. |
| DELETE | `/api/media/{id}` | Suppression du média ; ses dérivés sont conservés et détachés. `204`. |
| POST | `/api/media/{id}/process` | Envoi au service de traitement : `{"query": "texte facultatif"}`. Réponse `201` : nouveau média `processed` rattaché à l'original. |

Formats acceptés : images JPEG, PNG, GIF, WebP, BMP ; vidéos MP4, MOV, WebM, MKV, AVI.

Média :

```json
{
  "id": "...", "kind": "image", "source": "upload", "name": "photo.png",
  "content_type": "image/png", "size_bytes": 2685, "created_at": "...",
  "parent_id": null, "content_url": "/api/media/.../content"
}
```

`source` : `upload` (envoi utilisateur), `processed` (service de traitement), `generated`
(Kling), `export` (éditeur).

### Lien public signé

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/public/media/{jeton}` | Accès sans session à un média, via un jeton HMAC à durée limitée. Utilisé par Kling pour télécharger la vidéo source d'Omni-Video. Hors CSRF. |

## Recherche

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| POST | `/api/search` | `{"query": "...", "media_id": null}` | `{"query", "response", "timestamp", "processed_media"}` |

Sans `media_id`, la requête texte est transmise au service de traitement et `response` contient
sa réponse. Avec `media_id`, le média est traité avec le texte et `processed_media` contient le
résultat.

## Génération IA (Kling)

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/api/generations` | Soumet une génération. Réponse `201`, statut `submitted`. |
| GET | `/api/generations?source_media_id=&limit=&offset=` | Historique de l'utilisateur, du plus récent au plus ancien. `source_media_id` : générations faites à partir de ce média ; `limit` 1 à 200 (défaut 50). |
| GET | `/api/generations/{id}` | Statut à jour. Tant que la tâche n'est pas terminée, l'API interroge Kling ; à la réussite, les résultats sont téléchargés une seule fois dans la bibliothèque. |
| GET | `/api/generations/provider/health` | Test de connexion à Kling sans consommer de crédit : `{"ok", "message"}`. |

Corps de création :

| Champ | Valeurs | Remarques |
|---|---|---|
| `kind` | `text_to_image`, `text_to_video`, `image_to_video`, `omni_video` | requis |
| `prompt` | texte, 2 500 caractères max | requis sauf pour `image_to_video` |
| `negative_prompt` | texte | facultatif |
| `aspect_ratio` | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9` | ignoré pour Omni-Video en mode `base` |
| `duration` | `5`, `10` | vidéos |
| `mode` | `std`, `pro` | vidéos |
| `count` | 1 à 9 | texte vers image |
| `source_media_id` | UUID | image pour `image_to_video`, vidéo pour `omni_video` |
| `refer_type` | `base` (transformer), `feature` (référence de style) | Omni-Video |
| `keep_original_sound` | booléen | Omni-Video |

Génération : `{"id", "kind", "status", "prompt", "parameters", "source_media_id",
"error_message", "result_media_ids", "created_at", "updated_at"}` ; `status` vaut `submitted`,
`processing`, `succeeded` ou `failed`.

Le client interroge `GET /api/generations/{id}` toutes les 5 secondes, une requête à la fois,
pendant 30 minutes au plus. Indépendamment de lui, l'API suit les générations non terminées en
tâche de fond (`GOLDFX_GENERATION_SWEEP_SECONDS`) : les résultats arrivent dans la bibliothèque
même si personne n'affiche la génération. Un bail en base garantit qu'un seul processus interroge
Kling et importe les résultats d'une génération donnée. Au-delà de
`GOLDFX_GENERATION_MAX_AGE_HOURS`, une génération toujours en cours passe en `failed`.

## Conversion vidéo

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/api/transcode/webm-to-mp4` | Multipart : `file` (enregistrement WebM de l'éditeur). Par défaut, renvoie le MP4 (H.264, AAC) en téléchargement. Avec `save_to_library=true` (et `parent_id` facultatif) : enregistre le MP4 dans la bibliothèque et renvoie `201` + média. |

## Workflows

Graphes de l'onglet Workflow. Le serveur stocke le graphe et en vérifie la structure ; son
exécution a lieu dans le navigateur.

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/workflows` | Liste (sans le graphe), du plus récemment modifié au plus ancien. |
| POST | `/api/workflows` | `{"name", "graph"}`. Réponse `201`. |
| GET | `/api/workflows/{id}` | Workflow complet. |
| PUT | `/api/workflows/{id}` | Remplace le nom et le graphe. |
| DELETE | `/api/workflows/{id}` | `204`. |

Format du graphe (version 1) :

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "text", "position": { "x": 0, "y": 0 }, "data": { "text": "Un phare" } },
    { "id": "n2", "type": "kling-text-to-image", "position": { "x": 340, "y": 0 }, "data": {} }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "sourceHandle": "text", "target": "n2", "targetHandle": "prompt" }
  ]
}
```

Limites : 200 nœuds, 500 liens, 512 Ko, nom de 120 caractères ; chaque lien doit relier deux
nœuds existants. Les types de nœuds et leurs ports sont définis par le frontend
(`frontend/src/features/workflow/nodes/`) ; le serveur n'en vérifie que la structure.

## Contact

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| POST | `/api/contact` | `{"name", "email", "message"}` | `202 {"status": "sent"}` |

L'email part vers `GOLDFX_CONTACT_RECIPIENT`, avec l'adresse saisie en `Reply-To` et le compte de
l'expéditeur dans le corps.

## Contrat du service de traitement externe

Avec `GOLDFX_PROCESSOR_BACKEND=http`, l'API appelle `GOLDFX_PROCESSOR_URL` selon le contrat de la
version 1, implémenté par `HttpMediaProcessor` (`infrastructure/processing/processors.py`), ce
qui permet d'y brancher un vrai service d'IA sans modifier
l'application :

| Méthode | Chemin | Requête | Réponse attendue |
|---|---|---|---|
| POST | `/process-video` | multipart : `file` (image ou vidéo) et `query` (texte, éventuellement vide) | `200`, corps = fichier résultat, `Content-Type` du résultat |
| POST | `/process-query` | JSON `{"query": "..."}` | `200` JSON `{"response": "...", "timestamp": "ISO 8601"}` |

Tout autre statut est remonté à l'utilisateur comme une erreur du service de traitement.
