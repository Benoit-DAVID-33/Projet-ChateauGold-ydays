# Feuille de route IA : Hugging Face, RAG, LoRA

Aucune de ces briques n'existait dans la version 1. L'architecture de la version 2 permet de les
ajouter sans modifier les services existants : chaque brique est un adapter d'un port du domaine,
branché dans `container.py`.

Statut : proposition, en attente de deux informations (voir « Questions ouvertes »).

## 1. Connecteur Hugging Face

### Modes d'hébergement

| Mode | Usage | Points d'attention pour le connecteur |
|---|---|---|
| Inference Endpoints (dédié) | votre propre modèle (dépôt privé possible), entrées et sorties sur mesure via `handler.py` | URL et jeton Bearer. En mode « scale-to-zero », l'endpoint répond `503` pendant son démarrage (plusieurs minutes) : utiliser l'en-tête `X-Scale-Up-Timeout` ou relancer avec un délai croissant. |
| Spaces (Gradio) | prototype ou démonstration (ZeroGPU) | API en file d'attente (SSE), quotas GPU, mise en veille : fragile en production. |
| Inference Providers (`router.huggingface.co`) | modèles déjà servis par des partenaires (FLUX, texte vers vidéo, LLM) | jeton « fine-grained » avec le droit « Make calls to Inference Providers ». Ne convient pas à un modèle maison. |

### Plan d'intégration recommandé (Inference Endpoint et `handler.py`)

1. Contrat d'entrée et de sortie défini par nous : entrée `{prompt, params, source_url}` (lien
   signé, voir [ADR 0004](adr/0004-liens-signes-kling.md)), sortie
   `{status, result_urls}` ou `{status, result_base64}`.
2. Adapter `HuggingFaceProvider` :
   - s'il s'agit d'une génération longue, il implémente le port `GenerationProvider` (soumission
     puis suivi, comme Kling) ;
   - s'il s'agit d'un traitement court, il implémente le port `MediaProcessor` (comme le service
     de traitement externe).
   Le choix du fournisseur se fait par configuration dans `container.py`.
3. Configuration : `GOLDFX_HF_ENDPOINT_URL`, `GOLDFX_HF_TOKEN` (droits minimaux), délais et
   nombre de tentatives. Le test de connexion s'intègre à `/api/generations/provider/health`.
4. Interface : le nouveau fournisseur apparaît comme un mode de l'Atelier et comme un type de
   nœud du Workflow (voir [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md)).

## 2. RAG pour l'assistant de prompts (inspiré d'Agent Zero)

Objectif : passer d'un prompt construit par gabarit (actuel, déterministe, conservé en secours) à
un prompt rédigé par un LLM et enrichi par une base de connaissances.

- **Sources** : dossier `knowledge/` versionné (guides de rédaction de prompts par modèle,
  catalogue d'effets GOLD FX, vocabulaire caméra et éclairage), importé automatiquement avec
  détection des changements par empreinte, comme le dossier « knowledge » d'Agent Zero.
- **Mémoire de solutions** : quand une génération réussit et que l'utilisateur la conserve, son
  prompt est mémorisé (par utilisateur) et réutilisé pour les demandes proches.
- **Recherche** : extension `pgvector` dans le PostgreSQL existant. Aucun service supplémentaire,
  contrairement à un index FAISS sur fichiers qui se prête mal à plusieurs instances. Seuil de
  similarité et nombre de résultats configurables.
- **Ports à ajouter** : `Embedder`, `VectorStore`, `LLMClient`. Le client LLM vise une API
  compatible OpenAI : `router.huggingface.co/v1` en production, LM Studio ou Ollama en local.

## 3. LoRA (style visuel)

Un LoRA sert à donner un style visuel cohérent (le rendu « GOLD FX ») aux générations d'images et
de vidéos. Pour apporter de la connaissance, le RAG est plus adapté et moins coûteux.

1. Jeu de données : 20 à 50 images ou extraits sélectionnés, avec des légendes contenant un mot
   déclencheur.
2. Entraînement local (un GPU de 24 Go suffit pour un LoRA FLUX ou Wan) ou sur Hugging Face.
3. Publication dans un dépôt Hugging Face privé ; inférence via l'Inference Endpoint
   (`load_lora_weights`).
4. Dans l'application : paramètres `lora_id` et `lora_scale` du connecteur Hugging Face ;
   l'assistant insère le mot déclencheur dans le prompt.

**Licences.** Les poids FLUX.1-dev sont sous licence non commerciale. Pour un usage commercial,
choisir une base sous licence permissive (FLUX.1-schnell, SDXL, Wan 2.1).

## Ordre proposé

1. Connecteur Hugging Face (dès que le modèle et son mode d'hébergement sont connus).
2. RAG de l'assistant (indépendant du fournisseur de génération).
3. LoRA, une fois le style cible défini et le jeu de données constitué.

## Questions ouvertes

- Que fait le modèle hébergé sur Hugging Face (génération d'image, de vidéo, traitement d'un
  média existant, analyse) et quelles sont ses entrées et sorties ?
- Quel mode d'hébergement est retenu (Inference Endpoint dédié, Space, Inference Providers) ?

## Sources

- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/index)
- [Inference Endpoints : autoscaling, 503, X-Scale-Up-Timeout](https://huggingface.co/docs/inference-endpoints/en/guides/autoscaling)
- [Spaces comme API](https://huggingface.co/docs/hub/en/spaces-api-endpoints)
- [Agent Zero : mémoire et knowledge](https://deepwiki.com/agent0ai/agent-zero/4-memory-and-knowledge-system)
