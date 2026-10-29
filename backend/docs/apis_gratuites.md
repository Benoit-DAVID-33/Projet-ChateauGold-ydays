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

→ Ces modèles sont utilisables via **Hugging Face Inference Providers**, qui
propose un **palier gratuit mensuel** (crédits) : c'est la voie gratuite la plus
directe pour du text-to-video / image-to-video open source.

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
| Hugging Face Inference Providers | crédits mensuels | couvre aussi Wan 2.2 / MiniMax-H3 (vidéo) |
| Google AI Studio (Gemini) | palier gratuit | analyse vidéo possible ; édition vidéo non |
| Groq | palier gratuit | très rapide, modèles ouverts |
| Cerebras | palier gratuit | idem |
| OpenRouter | modèles suffixés `:free` | agrégateur multi-modèles |
| Mistral AI | palier gratuit | modèles Mistral |
| **Local** (Ollama, vLLM, llama.cpp) | gratuit | API compatible OpenAI (`/v1`) |

## 5. Recommandation pour ce projet

Le proxy `server/llm/` implémente déjà un **provider compatible OpenAI** (un seul
adaptateur couvre Hugging Face, MiniMax, vLLM, Ollama). Configuration conseillée
pour un usage **sans budget** :

```env
# Vidéo open source gratuite via HF Inference Providers
LLM_PROVIDER_PRIORITY=local,huggingface
HF_API_BASE_URL=https://router.huggingface.co/v1
HF_API_TOKEN=<token Hugging Face>
HF_MODEL=Wan-AI/Wan2.2-I2V-A14B

# Assistant texte local (aucun coût)
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3.1
```

> ⚠️ Les **quotas exacts** des paliers gratuits changent régulièrement : à
> confirmer sur la page *Pricing* de chaque fournisseur au moment de la mise en
> service. Les statuts de providers ci-dessus sont ceux relevés le 29/10/2026.
