# APIs et quotas gratuits pour les modèles de la veille

Objectif : savoir quels modèles cités dans la veille vidéo→vidéo sont réellement
accessibles **sans budget**, et par quel moyen.

Vérifié le **29 octobre 2026** via l'API Hugging Face
(`https://huggingface.co/api/models/<repo>?expand[]=inferenceProviderMapping`).

## 1. Modèles servis par un provider d'inférence (donc accessibles via API)

C'est le point clé : **Wan 2.2 (version de base) est bien servi**, contrairement
à la version *Animate*.

| Modèle | Providers (statut `live`) | Tâche | Identifiant provider |
| --- | --- | --- | --- |
| `Wan-AI/Wan2.2-TI2V-5B` | **fal-ai**, wavespeed | text-to-video | `fal-ai/wan/v2.2-5b/text-to-video` |
| `Wan-AI/Wan2.2-T2V-A14B` | **fal-ai**, **replicate**, wavespeed | text-to-video | `fal-ai/wan/v2.2-a14b/text-to-video`, `wan-video/wan-2.2-t2v-fast` |
| `Wan-AI/Wan2.2-I2V-A14B` | **fal-ai**, wavespeed | image-to-video | `fal-ai/wan/v2.2-a14b/image-to-video` |
| `MiniMaxAI/MiniMax-H3` | **fal-ai**, wavespeed | image-text-to-video | `minimax/h3/image-to-video` |

→ Ces modèles sont utilisables via **Hugging Face Inference Providers**.

### ⚠️ Ce n'est PAS gratuit par défaut

Vérifié sur `huggingface.co/docs/inference-providers/pricing` (29/10/2026) :

| Type de compte | Crédits mensuels inclus | Au-delà |
| --- | --- | --- |
| **Compte gratuit** | **aucun** | achat de crédits obligatoire (pay-as-you-go) |
| **PRO** | 2,00 $/mois | pay-as-you-go |
| **Organisation Team / Enterprise** | 2,00 $ **par siège** / mois | pay-as-you-go |

Conséquences pour le projet :

- Un **compte Hugging Face gratuit ne donne aucun crédit d'inférence** : il faut
  acheter des crédits ou passer à PRO.
- Être à **YNOV / dans la Hugging Face Academy ne donne pas de crédits** : la HF
  Academy est un programme pédagogique gratuit (cours, notebooks), sans quota
  d'API. Seule une **organisation Team/Enterprise** (si YNOV en a une) fournit
  des crédits partagés — dans ce cas, les requêtes se facturent à l'organisation
  avec l'en-tête `X-HF-Bill-To: <org>`.
- **Les Spaces (dont ZeroGPU) restent gratuits à l'usage via l'interface web**,
  mais ce n'est pas une API stable et programmatique.
- Alternative **réellement gratuite** : un **LLM local** (Ollama / vLLM), et
  l'auto-hébergement des modèles ouverts (GPU requis).

## 2. Modèles **sans** provider d'inférence (pas d'API publique)

| Modèle | `inferenceProviderMapping` |
| --- | --- |
| `Wan-AI/Wan2.2-Animate-14B` | `{}` (vide) |
| `Lightricks/LTX-2.5` | `{}` (vide) |
| `Viggle/Viggle-Animate` | `{}` (vide) |

Ces modèles ne sont **pas exposés en API** par Hugging Face. Trois voies :

1. **Hugging Face Spaces** (UI gratuite, pas d'API stable) — ex.
   `Wan-AI/Wan2.2-Animate`, `Viggle/viggle-animate`, `Lightricks/LTX-2.5`.
2. **Auto-hébergement** (GPU requis) — ex. Wan2.2-Animate ≈ 24 Go VRAM,
   Viggle-Animate ≈ 96 Go en bf16 (ou quantifié sur RTX 5090 32 Go),
   LTX-2.5 (pipeline `ltx-pipelines`).
3. **API propriétaire du modèle** (payante).

## 3. Services d'édition vidéo commerciaux

| Service | API | Quota gratuit |
| --- | --- | --- |
| Kling AI (VIDEO O1) | oui (`api.klingai.com`, JWT) | crédits d'essai à l'inscription, puis payant (crédits/s) |
| Luma (`ray-3.2`) | oui (`agents.lumalabs.ai/v1`) | essai limité, puis payant |
| Decart Lucy | oui (`api.decart.ai/v1/jobs/...`) | pas de palier gratuit annoncé (0,04 $/s) |
| xAI Grok Imagine | oui (`grok-imagine-video`) | pas de palier gratuit annoncé |
| Runway (Aleph 2.0) | oui | **plan gratuit** pour l'app, **Edit Studio/Aleph 2.0 sur plans payants** |

## 4. LLM texte gratuits (assistant de prompt)

Utiles pour la génération de prompts structurés (fonctionnalité « Assistant IA »
du projet), tous accessibles via une API **compatible OpenAI** :

| Fournisseur | Palier gratuit | Remarque |
| --- | --- | --- |
| Hugging Face Inference Providers | **aucun** pour un compte gratuit (PRO 2 $/mois) | couvre Wan 2.2 / MiniMax-H3 (vidéo) |
| Google AI Studio (Gemini) | palier gratuit | analyse vidéo possible ; édition vidéo non |
| Groq | palier gratuit | très rapide, modèles ouverts |
| Cerebras | palier gratuit | idem |
| OpenRouter | modèles suffixés `:free` | agrégateur multi-modèles |
| Mistral AI | palier gratuit | modèles Mistral |
| **Local** (Ollama, vLLM, llama.cpp) | **gratuit, sans quota** | API compatible OpenAI (`/v1`) |

## 5. Politique du proxy : « gratuit uniquement » (revérifié le 2 novembre 2026)

Revérifié sur `huggingface.co/docs/inference-providers/pricing` : un compte
gratuit n'a **aucun crédit** d'inférence et **toute requête routée par Hugging
Face est facturée au propriétaire du jeton** (ou à l'organisation de
`X-HF-Bill-To`). Mettre son jeton personnel dans `HF_API_TOKEN` ferait donc
payer son **compte HF personnel**.

Le proxy `server/llm/` applique désormais ces règles :

| Garde-fou | Effet |
| --- | --- |
| `LLM_FREE_ONLY=true` (**défaut**) | seuls les fournisseurs déclarés gratuits sont utilisés : `local`, `openrouter` (modèle `:free`), `groq` et `gemini` (palier gratuit). `huggingface`, `kling` et `minimax` sont **écartés** : aucun appel, donc aucun débit. |
| Jeton HF explicite uniquement | seul `HF_API_TOKEN` est lu ; jamais `HF_TOKEN` ni le cache `huggingface-cli login`. Vide = fournisseur « non configuré », aucune requête. |
| `HF_FORBIDDEN_ACCOUNTS` / `HF_EXPECTED_ACCOUNT` | si `LLM_FREE_ONLY=false`, le propriétaire du jeton est vérifié (`/api/whoami-v2`) avant le premier appel ; compte interdit, inattendu ou vérification impossible ⇒ refus. |
| `HF_BILL_TO` | facturer une organisation Team/Enterprise (ex. celle de l'école) au lieu de l'utilisateur. |
| OpenRouter `:free` imposé | sans suffixe `:free`, OpenRouter est classé payant et écarté. |
| `LLM_QUOTAS` + `LLM_QUOTA_FILE` | quotas **quotidiens** réels (remise à zéro chaque jour UTC, persistés sur disque) pour rester sous les limites des paliers gratuits. |
| Console d'admin / `GET /api/llm/providers` | pour chaque fournisseur : `free`, `billing`, `configured`, `eligible`, `reason`. |

> Groq et Gemini restent gratuits **tant que la facturation n'est pas activée**
> sur le compte qui fournit la clé : utilisez un compte sans moyen de paiement,
> ou mettez `GROQ_FREE_TIER=false` / `GEMINI_FREE_TIER=false`.
> Les routes explicites `/kling/*` ne passent pas par le proxy et consomment
> les crédits Kling (pas de palier gratuit côté API).

Configuration conseillée, **sans budget et sans toucher au compte HF personnel** :

```env
LLM_FREE_ONLY=true
LLM_PROVIDER_PRIORITY=local,openrouter,groq,gemini

# LLM local (aucun coût, aucun compte)
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3.1

# Clés de paliers gratuits (comptes sans moyen de paiement)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-oss-20b:free
GROQ_API_KEY=
GEMINI_API_KEY=
LLM_QUOTAS=openrouter=45,groq=900,gemini=400

# Hugging Face : laisser vide. Ceinture et bretelles si un jeton est ajouté un jour :
HF_API_TOKEN=
HF_FORBIDDEN_ACCOUNTS=<votre-compte-hf-personnel>
```

Les modèles vidéo ouverts (Wan, MiniMax-H3, JoyAI-Video-Edit…) restent
utilisables gratuitement **sur un GPU local** ou via l'interface web des
Spaces ; voir `modeles_video_a_video.md`.

## 6. Démonstration vidéo gratuite : Space Hugging Face (vérifié le 2 novembre 2026)

Les **Spaces ZeroGPU** sont gratuits, mais avec un quota GPU **par appelant et par jour**
(`huggingface.co/docs/hub/spaces-zerogpu`) : **2 min sans compte**, 5 min avec un compte
gratuit, 40 min en PRO. Le backend les appelle **sans aucun jeton** : aucun compte (ni le
tien, ni un autre) n'est utilisé ni débité.

Space retenu : **JoyAI Video Edit** (`hugging-apps/jdopensource-joyai-video-edit`, modèle
`jdopensource/JoyAI-Video-Edit` sous licence Apache-2.0), le seul Space officiel trouvé qui
**modifie une vidéo existante** à partir d'une instruction (les Spaces MiniMax-H3 / Wan
génèrent une nouvelle vidéo depuis un texte ou une image).

| Point | Valeur (lue dans le code du Space et mesurée) |
| --- | --- |
| Durée par appel | 0,5 à 4 s (le montage découpe en passages de 4 s) |
| Sortie | 24 i/s, 720×1248 ou 1248×720 ; un peu plus courte que l'entrée (paquets de 8 images), complétée par le montage |
| Quota consommé | ≈ 15 s + 2,2 s par paquet de 8 images (≈ 41 s pour 4 s, ≈ 22 s pour 1 s) |
| Essai réel | 1 s modifiée en 11,4 s ; montage complet 4–6 s réussi, durée finale à 3 ms près |
| Limite observée | sur un restylage, l'identité d'une personne peut changer |

Garde-fous (`server/video_editing/providers/hf_space.py`) :

- quota local `HF_SPACE_DAILY_GPU_SECONDS` (110 s par défaut, sous les 120 s anonymes),
  persisté dans `HF_SPACE_BUDGET_FILE` : une génération qui dépasserait le reste du jour est
  refusée **avant** l'envoi ; un message « quota » du Space bloque jusqu'au lendemain ;
- le quota anonyme est celui de **l'adresse IP du serveur**, partagé par tous les visiteurs ;
- le nom de l'endpoint Gradio est lu dans `/gradio_api/info` (il a changé : `/edit_video_1`) ;
- `PLAN_FREE_ONLY_FREE_MODELS=true` (défaut) : l'offre Découverte n'utilise **que** ce Space,
  rien n'est facturé à l'exploitant ; `HF_SPACE_ENABLED=false` le désactive.

Un Space communautaire n'est pas un service garanti (pause, file d'attente, changement
d'API) : c'est une démonstration gratuite, pas un moteur de production.
