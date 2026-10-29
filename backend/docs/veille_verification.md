# Vérification de la veille « vidéo → vidéo »

Vérification des affirmations du document
`veille_video_a_video_2026-10-28.pdf` contre les **sources officielles**,
consultées le **29 octobre 2026**.

Statuts : **Confirmé** (la source dit la même chose), **Nuancé** (partiellement
exact), **Non vérifiable** (source absente/404 ou non trouvée).

## Synthèse

La veille est **globalement exacte et bien sourcée**. Un seul point est à
corriger : les chemins d'API LTX « Retake » et la promesse « bit-à-bit ».

## Services d'édition vidéo

| Affirmation | Source officielle | Statut |
| --- | --- | --- |
| Runway Aleph 2.0 / Edit Studio : séquences jusqu'à 30 s en 1080p, aperçu image avant rendu, application multi-plans **y compris à travers les coupes**, sur footage réel, **plans payants** | `runway.com/product/ai-video-editor` | ✅ **Confirmé** (30 s, 1080p, multi-shot, footage réel, « available on paid Runway plans ») |
| Luma `ray-3.2` : `type: "video_edit"`, source ≤ 18 s, keyframes, `strength` (adhere/flex/reimagine), `controls` pose/depth/normals/trajectory/face | `docs.agents.lumalabs.ai/guides/videos/editing` | ✅ **Confirmé** (endpoint `agents.lumalabs.ai/v1/generations`, résolutions 360p–1080p, ≤ 64 keyframes) |
| Kling VIDEO O1 : édition, inpainting, transformation, stylisation ; source 3–10 s ; ≤ 200 Mo ; ≤ 2K ; lancement **15 décembre 2025** | `kling.ai/quickstart/klingai-video-o1-user-guide` | ✅ **Confirmé** (date, 3–10 s, 200 Mo, 2K, crédits) |
| Decart Lucy : édition par prompt + image de référence facultative, **durée illimitée**, 200 Mo, 720p, 0,04 $/s ; **Lucy 2.6 existe** | `docs.platform.decart.ai/models/video/video-editing` | ✅ **Confirmé** (endpoints `/v1/jobs/lucy-2.6`, `lucy-2.5`, `lucy-2.1`, `lucy-latest`) |
| xAI `grok-imagine-video` : source ≤ 8,7 s, sortie = durée/ratio/résolution de la source plafonnée 720p, `duration`/`aspect_ratio`/`resolution` ignorés | `docs.x.ai/developers/model-capabilities/video/editing` | ✅ **Confirmé mot pour mot** |
| LTX **Retake** : régénérer une fenêtre temporelle (remplacer vidéo, audio ou les deux) | `docs.ltx.io` → *submit-retake* | ✅ **Confirmé** (la fonctionnalité existe) |
| LTX : endpoints **`/v1/retake`** et **`/v2/retake`** ; images hors fenêtre **bit-à-bit identiques** | URL de la veille `ltx.io/model/capabilities/video-editing` | ❌ **Non vérifiable** : URL en **404** ; ces chemins n'apparaissent pas dans la documentation actuelle |

## Modèles Hugging Face cités

| Affirmation | Source officielle | Statut |
| --- | --- | --- |
| `MiniMaxAI/MiniMax-H3` : variantes **FL2VA** (texte/première-dernière image) et **Ref2VA** (références multimodales) ; licence communautaire | carte modèle HF | ✅ **Confirmé** (33 B, licence `minimax-h3-community-license-agreement`) |
| `Wan-AI/Wan2.2-Animate-14B` : publié le **19 septembre 2025**, animation **ou** remplacement, **pas** un éditeur généraliste au prompt | carte modèle HF | ✅ **Confirmé** (news « Sep 19, 2025 », modes animation/replacement, Apache-2.0) |
| `Lightricks/LTX-2.5` + IC-LoRAs, base confirmée | dépôt HF Lightricks | ✅ **Confirmé** (`LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler` cité dans la recette officielle) |
| `Viggle/Viggle-Animate` : remplacement depuis **une frame repeinte**, **sans prompt texte**, licence MiniMax H3 | carte modèle HF | ✅ **Confirmé** (« no user-provided text prompt », 33,1 B, dérivé H3) |
| `akatz-ai/MiniMax-H3-Character-Swap-LoRA` (communautaire, expérimental, non autonome) | carte modèle HF | ✅ **Confirmé** (V1/V1.5, 124 k téléchargements, nécessite la base Ref2VA + Turbo) |
| Variante **Turbo** de H3 | recette du LoRA ci-dessus | ✅ **Confirmé** (`minimax_h3_fl2v_turbo_8step_..._768p_...`) |

## Points à corriger dans la veille

1. **LTX Retake** : remplacer l'URL morte `https://ltx.io/model/capabilities/video-editing`
   par `https://docs.ltx.io/` (section *Retake*), et retirer/atténuer les chemins
   `/v1/retake`, `/v2/retake` ainsi que la promesse « bit-à-bit identique hors
   fenêtre » (non corroborés).
2. Aucune autre correction nécessaire : le reste des affirmations est confirmé.

## Méthode

- Extraction du texte du PDF (Flate + ASCII85) puis lecture intégrale.
- Vérification via les pages officielles (`webfetch`) et l'API Hugging Face
  (`https://huggingface.co/api/models/<repo>?expand[]=inferenceProviderMapping`).
- Les fonctionnalités et endpoints cités peuvent évoluer : la date de contrôle
  est indiquée ci-dessus.
