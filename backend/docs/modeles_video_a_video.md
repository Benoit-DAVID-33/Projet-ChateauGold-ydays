# Modèles vidéo → vidéo pilotables par prompt (état au 2 novembre 2026)

Objectif : savoir quels modèles **modifient une vidéo existante à partir d'un
prompt texte**, comment leur parler, et lesquels sont gérés par le
convertisseur de prompts du backend (`POST /api/prompt/enhance`,
`GET /api/prompt/models`).

Niveau de preuve indiqué pour chaque ligne :
**doc** = documentation officielle du fournisseur, **HF** = carte modèle
Hugging Face, **tiers** = page d'un hébergeur ou agrégateur (fal, Replicate,
Runware, kie.ai…). Les noms, limites et prix changent vite : revérifier
avant toute mise en production.

## 1. API commerciales (payantes, aucune n'a de palier gratuit API durable)

| Modèle | Clé convertisseur | Entrées | Façon de prompter | Limites connues | Preuve |
| --- | --- | --- | --- | --- | --- |
| **Kling VIDEO O1 / Kling 3.0 Omni** (endpoint `omni-video`) — *déjà intégré* | `kling` | vidéo + prompt (+ images de référence) | instruction impérative ; référence `<<<video_1>>>`, images `<<<image_1>>>` ; une modif par prompt | source 3–10 s, 200 Mo ; `refer_type=base` (édition, durée = source) / `feature` (reprise style/caméra, plan suivant) ; prompt négatif | doc (O1) + tiers (syntaxe `<<<…>>>` : Replicate, Kling 3.0 Omni) |
| **Kling O3 Edit** | `kling` | vidéo + prompt | idem Omni | source 3–15 s, facturé à la seconde | tiers (fal, Runway Dev) |
| **Runway Aleph 2.0** (`aleph2`, `video_to_video`) | `runway` | vidéo + prompt (+ jusqu'à 5 keyframes) | instruction explicite (objet, style, lumière, étalonnage) ; sait générer un nouvel angle ou le plan suivant | prompt ≤ 1000 caractères ; plans payants | doc (changelog API) + tiers |
| **Luma Ray 3.2** (`type: "video_edit"`, *Modify*) | `luma` | vidéo + prompt (+ keyframes, contrôles pose/profondeur) | **décrire le résultat** ; fidélité via `strength` = `adhere` / `flex` / `reimagine` | source ≤ 18 s, ≤ 64 keyframes | doc |
| **Decart Lucy 2.5** (Lucy 2.6 aussi publiée) | `decart` | vidéo + prompt (+ image de référence) | mot déclencheur (*Add / Remove / Replace / Change*), 20–30 mots, nuance + finition exactes ; **ne pas** écrire « garder la pose » | 720p, 200 Mo, ≈ 0,04 $/s | doc + cookbook Decart |
| **Seedance 2.5 — mode édition** (`video-edit`, `video-edit-turbo`) | `seedance` | vidéo + prompt | mots déclencheurs : *edit, remove, add, replace, change to, restyle, relight* | une durée entière = extension (refusée en édition) | tiers (Runware, WaveSpeed) |
| **xAI Grok Imagine** (`grok-imagine-video`, édition) | `xai` | vidéo + prompt | instruction impérative | source ≤ 8,7 s ; durée/ratio/résolution = source (720p max) | doc |
| **Wan 2.7 Edit** (hébergé) | `wan` | vidéo + prompt | instruction + détails visuels ; prompt négatif | — | tiers (kie.ai) |
| **LTX Retake** (Lightricks) | — | vidéo + prompt + fenêtre temporelle | régénère un intervalle (vidéo, audio ou les deux) | chemins d'API à confirmer | doc (`docs.ltx.io`) |

## 2. Modèles ouverts (Hugging Face) — gratuits si exécutés sur votre GPU

| Modèle | Type | Prompt texte ? | Remarques | Preuve |
| --- | --- | --- | --- | --- |
| `jdopensource/JoyAI-Video-Edit` | édition par instruction, temps réel (16 B) | **oui** | Apache-2.0 ; 840×480 @ 24 i/s sur une RTX 5090 (32 Go) ; démo Space `wxDai/joyai-video-edit` ; édition guidée par image (RV2V) | HF (MAJ 01/11/2026) |
| `yunpeng1998/Qwen-Video-Edit` | édition par instruction | **oui** | MIT ; réutilise un modèle d'édition d'image sur les latents vidéo | HF |
| `decart-ai/Lucy-Edit-Dev`, `Lucy-Edit-1.1-Dev` | édition par instruction | **oui** | poids ouverts de Lucy ; ~20–30 mots descriptifs | HF |
| Wan VACE (`Wan-AI/Wan2.1-VACE-14B`) | édition / restylage guidé par référence | oui | local, gourmand en VRAM | tiers |
| `Lightricks/LTX-2.5` + IC-LoRA (`Ingredients`, `Alpha-Gen`, `SDR-To-HDR`…) | vidéo→vidéo par LoRA de contrôle | partiel (prompt + LoRA) | LoRA spécialisés plutôt qu'éditeur généraliste | HF |
| `MiniMaxAI/MiniMax-H3` (Ref2VA) + LoRA `akatz-ai/…-Character-Swap`, `…-Person-Remover` | génération guidée par références, LoRA communautaires | partiel | pas un éditeur généraliste ; LoRA expérimentaux | HF |

**Pas pilotables par un prompt d'édition** (à ne pas proposer pour ce besoin) :
`Viggle/Viggle-Animate` (aucun prompt texte), `Wan-AI/Wan2.2-Animate-14B`
(animation / remplacement de personnage), `Efficient-Large-Model/Open-H3-Regenerate-2K`
(raffinage / montée en résolution).

## 3. Comment le backend convertit une demande naturelle

`POST /api/prompt/enhance` (`{"text", "model", "use_llm"}`) et, automatiquement,
`POST /kling/omni-video` (désactivable avec `PROMPT_AUTO_ENHANCE=false` ou
`"auto_prompt": false`) :

1. **Découpage** : « enlève le logo et mets de la neige » → 2 étapes (un prompt
   par génération, la sortie de l'une sert de source à la suivante).
2. **Intention** par étape : ajouter, retirer, remplacer, recolorer, restyler,
   fond, météo, lumière, angle, plan suivant / précédent.
3. **Traduction FR → EN** hors ligne (lexique spécialisé, adjectifs replacés :
   « une veste en cuir noir » → « a black leather jacket »). Un mot inconnu ⇒
   prompt laissé en français (pas de mélange) + conseil d'activer le LLM.
4. **Gabarit du modèle** + enrichissement (intégration, lumière, cohérence
   temporelle) + clause « Keep … unchanged » si le modèle en profite.
5. **Paramètres conseillés** (`refer_type` Kling, `strength` Luma…) et prompt négatif.
6. **Mode LLM** (fournisseur **gratuit** seulement, cf. `apis_gratuites.md`) :
   réécriture en JSON à partir de la fiche du modèle et du brouillon par règles,
   référence `<<<video_1>>>` imposée pour Kling, repli sur les règles en cas d'échec.

Exemple (Kling) :

```text
Demande : remplace le fond par une plage tropicale au coucher de soleil
Prompt  : Replace the background of <<<video_1>>> with a tropical beach at sunset,
          with matching light direction and clean, natural edges around the subject.
          Keep the subject's identity, pose, motion and camera framing unchanged.
Params  : {"model_name": "kling-video-o1", "refer_type": "base", "keep_original_sound": "yes"}
```

## Sources

- Kling Omni (API officielle) : https://kling.ai/document-api/apiReference/model/OmniVideo
- Kling 3.0 Omni (syntaxe `<<<video_1>>>`, `base`/`feature`) : https://replicate.com/kwaivgi/kling-v3-omni-video
- Runway API changelog (Aleph 2.0 `aleph2`) : https://docs.dev.runwayml.com/api-details/api_changelog/
- Luma video editing : https://docs.agents.lumalabs.ai/guides/videos/editing/
- Decart video editing : https://docs.platform.decart.ai/models/video/video-editing — cookbook : https://cookbook.decart.ai/lucy-edit-comfy
- Seedance 2.5 editing : https://runware.ai/docs/models/bytedance-seedance-2-5/guides/editing
- Panorama 2026 (O3 Edit, Wan 2.7 Edit, Seedance edit) : https://nodetool.ai/blog/edit-video-with-text-prompts
- Cartes Hugging Face citées : https://huggingface.co/jdopensource/JoyAI-Video-Edit, https://huggingface.co/yunpeng1998/Qwen-Video-Edit, https://huggingface.co/decart-ai/Lucy-Edit-Dev
