# Spécifications des modèles utilisés par GOLD FX

> Fichier **généré** par `scripts/generate_model_specs.py` depuis `server/video_editing/catalog.py` : ne pas l'éditer à la main.

## 1. Modèles d'édition vidéo (vidéo → vidéo, pilotés par prompt)

| Modèle | Intégré | Durée source | Qualités | Prix min. |
| --- | --- | --- | --- | --- |
| Kling VIDEO O1 (Omni, API Kling directe) | oui | 3 s → 10 s | HD · 720p, Full HD · 1080p | 0.078 $/s |
| Kling O3 Edit (via fal.ai) | oui | 3 s → 15 s | HD · 720p, Full HD · 1080p, 4K · 2160p | 0.126 $/s |
| LTX 2.3 Retake (via fal.ai) — édition d'une fenêtre temporelle | oui | 2 s → 20 s | HD · résolution source | non publié |
| Decart Lucy 2.6 (API Decart) | oui | 0.5 s → illimitée | HD · 720p | 0.040 $/s |
| Luma Ray 3.2 Modify (API Luma) | oui | 1 s → 18 s | Rapide · 540p, HD · 720p, Full HD · 1080p | non publié |
| Runway Aleph 2.0 | non | 2 s → 30 s | Full HD · 1080p | non publié |
| Seedance 2.5 (mode édition) | non | 1 s → illimitée | — | non publié |
| xAI Grok Imagine (édition) | non | 1 s → 8.7 s | HD · 720p max | non publié |

### Kling VIDEO O1 (Omni, API Kling directe)

- **Clé** : `kling-o1` — intégré
- **Éditeur** : Kuaishou / Kling AI — **API** : `POST /v1/videos/omni-video (model_name=kling-video-o1)`
- **Entrée** : mp4, mov · durée 3 s → 10 s · 200 Mo max
- **Référence de la vidéo dans le prompt** : `<<<video_1>>>`
- **Fenêtre temporelle native** : non · **prompt négatif** : oui · **images de référence** : 4
- **Points forts** : add, angle, background, generic, next_shot, previous_shot, recolor, remove, replace, restyle
- **Fiche de prompt** : `kling` (Kling VIDEO O1 / Kling 3.0 Omni (édition vidéo))
- **Niveau de preuve** : documentation officielle

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| HD | 720p | `mode=std` | 0.078 $/s (revendeur / agrégateur) |
| Full HD | 1080p | `mode=pro` | 0.104 $/s (revendeur / agrégateur) |

> Nécessite PUBLIC_BASE_URL : Kling télécharge la vidéo depuis une URL publique.
> En édition (refer_type=base) la durée de sortie est celle du segment envoyé.
> Prix : grille d'un revendeur (PiAPI), la grille officielle Kling n'est pas publique.

Sources : <https://kling.ai/quickstart/klingai-video-o1-user-guide>, <https://piapi.ai/kling-o1>

### Kling O3 Edit (via fal.ai)

- **Clé** : `kling-o3-edit` — intégré
- **Éditeur** : Kuaishou / Kling AI — **API** : `fal-ai/kling-video/o3/{standard|pro|4k}/video-to-video/edit`
- **Entrée** : mp4, mov · durée 3 s → 15 s · 200 Mo max
- **Référence de la vidéo dans le prompt** : `@Video1`
- **Fenêtre temporelle native** : non · **prompt négatif** : non · **images de référence** : 4
- **Points forts** : add, angle, background, generic, next_shot, previous_shot, recolor, remove, replace, restyle
- **Fiche de prompt** : `kling` (Kling VIDEO O1 / Kling 3.0 Omni (édition vidéo))
- **Niveau de preuve** : documentation officielle

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| HD | 720p | `endpoint=fal-ai/kling-video/o3/standard/video-to-video/edit` | 0.126 $/s (documentation officielle) |
| Full HD | 1080p | `endpoint=fal-ai/kling-video/o3/pro/video-to-video/edit` | 0.168 $/s (documentation officielle) |
| 4K | 2160p | `endpoint=fal-ai/kling-video/o3/4k/video-to-video/edit` | 0.420 $/s (documentation officielle) |

> La vidéo se référence par @Video1 (et non <<<video_1>>> comme l'API Kling directe).
> Résolution source acceptée : 720 à 3840 px.
> Résolution de sortie par niveau déduite du nom de l'offre (non chiffrée par fal).

Sources : <https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit/llms.txt>, <https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/llms.txt>, <https://fal.ai/models/fal-ai/kling-video/o3/4k/video-to-video/edit/llms.txt>

### LTX 2.3 Retake (via fal.ai) — édition d'une fenêtre temporelle

- **Clé** : `ltx-2.3-retake` — intégré
- **Éditeur** : Lightricks — **API** : `fal-ai/ltx-2.3/retake-video`
- **Entrée** : mp4, mov · durée 2 s → 20 s · 200 Mo max
- **Référence de la vidéo dans le prompt** : aucune (texte seul)
- **Fenêtre temporelle native** : oui · **prompt négatif** : non · **images de référence** : 0
- **Points forts** : add, generic, next_shot, replace
- **Fiche de prompt** : `generic` (Modèle générique)
- **Niveau de preuve** : documentation officielle

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| HD | résolution source | — | non publié |

> Régénère seulement [start_time, start_time + duration] : le reste de la vidéo est conservé par le modèle (pas de découpage nécessaire).
> Bornes 2 à 20 s relevées sur un miroir tiers, non confirmées par fal.
> Prix non publié pour LTX 2.3 (LTX 2 : 0,10 $/s).

Sources : <https://fal.ai/models/fal-ai/ltx-2.3/retake-video/api>, <https://fal.ai/models/fal-ai/ltx-2/retake-video/llms.txt>

### Decart Lucy 2.6 (API Decart)

- **Clé** : `lucy-2.6` — intégré
- **Éditeur** : Decart — **API** : `POST https://api.decart.ai/v1/jobs/lucy-2.6`
- **Entrée** : mp4 · durée 0.5 s → illimitée · 200 Mo max · ratio 16:9 / 9:16
- **Référence de la vidéo dans le prompt** : aucune (texte seul)
- **Fenêtre temporelle native** : non · **prompt négatif** : non · **images de référence** : 1
- **Points forts** : add, generic, recolor, replace, restyle
- **Fiche de prompt** : `decart` (Decart Lucy 2.5 (édition vidéo))
- **Niveau de preuve** : documentation officielle

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| HD | 720p | `resolution=720p` | 0.040 $/s (documentation officielle) |

> Durée illimitée, mais 720p uniquement et ratio 16:9 ou 9:16.
> Très économique pour les changements locaux (tenue, objet, couleur).

Sources : <https://docs.platform.decart.ai/models/video/video-editing>

### Luma Ray 3.2 Modify (API Luma)

- **Clé** : `luma-ray-3.2` — intégré
- **Éditeur** : Luma AI — **API** : `POST https://agents.lumalabs.ai/v1/generations (type=video_edit)`
- **Entrée** : mp4, mov, webm · durée 1 s → 18 s · 200 Mo max
- **Référence de la vidéo dans le prompt** : aucune (texte seul)
- **Fenêtre temporelle native** : non · **prompt négatif** : non · **images de référence** : 0
- **Points forts** : background, generic, relight, restyle, weather
- **Fiche de prompt** : `luma` (Luma Ray 3.2 (video_edit / Modify))
- **Niveau de preuve** : documentation officielle

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| Rapide | 540p | `resolution=540p` | non publié |
| HD | 720p | `resolution=720p` | non publié |
| Full HD | 1080p | `resolution=1080p` | non publié |

> Fidélité réglée par strength (adhere / flex / reimagine), pas par le prompt.
> HDR possible en 720p et 1080p (option hdr).
> Prix non chiffré sur la page d'édition (grille Luma séparée).

Sources : <https://docs.agents.lumalabs.ai/guides/videos/editing/>

### Runway Aleph 2.0

- **Clé** : `runway-aleph-2` — **non intégré** (référencé seulement)
- **Éditeur** : Runway — **API** : `video_to_video (model=aleph2)`
- **Entrée** : mp4 · durée 2 s → 30 s · 16 Mo max
- **Référence de la vidéo dans le prompt** : aucune (texte seul)
- **Fenêtre temporelle native** : non · **prompt négatif** : non · **images de référence** : 0
- **Points forts** : angle, next_shot, relight, replace, restyle
- **Fiche de prompt** : `runway` (Runway Aleph 2.0 (aleph2, video-to-video))
- **Niveau de preuve** : revendeur / agrégateur

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| Full HD | 1080p | — | non publié |

> Non intégré : paramètres exacts de l'API aleph2 non confirmés.

Sources : <https://docs.dev.runwayml.com/api-details/api_changelog/>

### Seedance 2.5 (mode édition)

- **Clé** : `seedance-2.5-edit` — **non intégré** (référencé seulement)
- **Éditeur** : ByteDance — **API** : `bytedance/seedance-2.5/video-edit`
- **Entrée** : mp4 · durée 1 s → illimitée · ? Mo max
- **Référence de la vidéo dans le prompt** : aucune (texte seul)
- **Fenêtre temporelle native** : non · **prompt négatif** : non · **images de référence** : 0
- **Points forts** : add, relight, remove, replace, restyle
- **Fiche de prompt** : `seedance` (Seedance 2.5 (mode édition))
- **Niveau de preuve** : revendeur / agrégateur

Aucun niveau de qualité documenté de façon fiable.

> Non intégré : limites et qualités non documentées de façon officielle.

Sources : <https://runware.ai/docs/models/bytedance-seedance-2-5/guides/editing>

### xAI Grok Imagine (édition)

- **Clé** : `grok-imagine-video` — **non intégré** (référencé seulement)
- **Éditeur** : xAI — **API** : `grok-imagine-video`
- **Entrée** : mp4 · durée 1 s → 8.7 s · ? Mo max
- **Référence de la vidéo dans le prompt** : aucune (texte seul)
- **Fenêtre temporelle native** : non · **prompt négatif** : non · **images de référence** : 0
- **Points forts** : add, replace, restyle
- **Fiche de prompt** : `xai` (xAI Grok Imagine (grok-imagine-video, édition))
- **Niveau de preuve** : documentation officielle

| Qualité | Résolution | Paramètres envoyés | Prix indicatif |
| --- | --- | --- | --- |
| HD | 720p max | — | non publié |

> Non intégré. Durée, ratio et résolution suivent la source (720p max).

Sources : <https://docs.x.ai/developers/model-capabilities/video/editing>

## 2. Fournisseurs texte du proxy (prompt engineering, chatbot)

Avec `LLM_FREE_ONLY=true` (défaut), seuls les fournisseurs gratuits sont appelés.

| Fournisseur | Description | Facturation | Limites |
| --- | --- | --- | --- |
| `local` | Ollama / vLLM / llama.cpp (machine locale) | gratuit | aucune limite hors matériel |
| `openrouter` | OpenRouter, modèle `:free` imposé | gratuit | ≈ 20 req/min, 50 req/jour (source tierce) |
| `groq` | Groq (`openai/gpt-oss-120b` par défaut) | palier gratuit | ≈ 30 req/min, 1 000 req/jour (source tierce) |
| `gemini` | Google Gemini (endpoint compatible OpenAI) | palier gratuit | limites visibles dans AI Studio |
| `huggingface` | Hugging Face Inference Providers | payant | facturé au propriétaire du jeton |
| `kling` | Kling AI (image / vidéo) | payant | crédits du compte Kling |
| `minimax` | MiniMax (texte) | payant | crédits du compte MiniMax |

## 3. Formats acceptés par le site

- **Upload** : MP4, MOV, AVI, MKV, WebM (vidéo) ; JPG, PNG, GIF, BMP, WebP, SVG (image).
- **Édition IA** : la vidéo est découpée et ré-encodée en H.264 (CRF 17, yuv420p) ; chaque segment est remis à la résolution et à la cadence de la source ; la piste audio d'origine est conservée sur toute la durée du résultat (MP4, faststart).
