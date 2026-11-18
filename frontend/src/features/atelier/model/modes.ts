/**
 * Modes de l'Atelier et construction des requêtes de génération (fonctions pures).
 *
 * Un mode correspond à un onglet du centre de l'Atelier : « Annoter » (édition seule)
 * ou l'une des générations Kling. Les paramètres visibles et la requête envoyée
 * dépendent du mode ; tout est calculé ici pour rester testable sans DOM.
 */
import type { GenerationIn, GenerationKind, Media, MediaKind } from "@/shared/api/client";

export type AtelierMode = "annotate" | GenerationKind;

export interface ModeInfo {
  id: AtelierMode;
  label: string;
  /** Résumé affiché sous les onglets. */
  description: string;
  /** Type de média source requis (null : aucun). */
  source: MediaKind | null;
}

export const MODES: readonly ModeInfo[] = [
  {
    id: "annotate",
    label: "Annoter",
    description:
      "Formes, lignes, texte, dessin et objets 3D sur le média. Export, enregistrement ou envoi à l'API de traitement.",
    source: null,
  },
  {
    id: "image_to_video",
    label: "Image vers vidéo",
    description:
      "Anime l'image ouverte. Le prompt décrit le mouvement ; les annotations peuvent y être décrites.",
    source: "image",
  },
  {
    id: "omni_video",
    label: "Omni-Video",
    description:
      "Transforme la vidéo ouverte, ou s'en sert comme référence de style, selon le prompt.",
    source: "video",
  },
  {
    id: "text_to_image",
    label: "Texte vers image",
    description: "Crée de une à neuf images à partir du prompt.",
    source: null,
  },
  {
    id: "text_to_video",
    label: "Texte vers vidéo",
    description: "Crée une vidéo de 5 ou 10 secondes à partir du prompt.",
    source: null,
  },
];

export const modeInfo = (mode: AtelierMode): ModeInfo =>
  MODES.find((m) => m.id === mode) ?? MODES[0]!;

/** Raison pour laquelle un mode est indisponible avec ce média, ou null s'il l'est. */
export function unavailableReason(mode: AtelierMode, media: Media | null): string | null {
  if (mode === "annotate") {
    return media ? null : "Chargez une image ou une vidéo pour l'annoter.";
  }
  const { source } = modeInfo(mode);
  if (source === null) return null;
  if (media?.kind === source) return null;
  return source === "image"
    ? "Ouvrez une image pour l'animer."
    : "Ouvrez une vidéo pour la transformer.";
}

/** Mode affiché à l'ouverture : annotation si un média est ouvert, sinon génération du type de la page. */
export function defaultMode(media: Media | null, pageKind: MediaKind): AtelierMode {
  if (media) return "annotate";
  return pageKind === "video" ? "text_to_video" : "text_to_image";
}

export const isGenerationMode = (mode: AtelierMode): mode is GenerationKind => mode !== "annotate";

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"] as const;

export interface GenerationParams {
  aspectRatio: string;
  duration: "5" | "10";
  quality: "std" | "pro";
  count: number;
  referType: "base" | "feature";
  keepOriginalSound: boolean;
}

export const DEFAULT_PARAMS: GenerationParams = {
  aspectRatio: "16:9",
  duration: "5",
  quality: "std",
  count: 1,
  referType: "base",
  keepOriginalSound: true,
};

export interface ParamVisibility {
  aspectRatio: boolean;
  duration: boolean;
  quality: boolean;
  count: boolean;
  referType: boolean;
  keepOriginalSound: boolean;
}

/** Paramètres pertinents pour un type de génération (les autres sont masqués et ignorés). */
export function visibleParams(kind: GenerationKind, params: GenerationParams): ParamVisibility {
  const omni = kind === "omni_video";
  const omniBase = omni && params.referType === "base";
  return {
    aspectRatio: kind === "text_to_image" || kind === "text_to_video" || (omni && !omniBase),
    duration: kind !== "text_to_image" && !omniBase,
    // Omni-Video n'existe qu'en qualité Pro.
    quality: kind === "text_to_video" || kind === "image_to_video",
    count: kind === "text_to_image",
    referType: omni,
    keepOriginalSound: omni,
  };
}

export const promptRequired = (kind: GenerationKind): boolean => kind !== "image_to_video";

/** Vérifie qu'une génération peut partir ; renvoie le message à afficher sinon. */
export function generationBlocker(
  kind: GenerationKind,
  prompt: string,
  media: Media | null,
  promptTooLong: boolean,
): string | null {
  const reason = unavailableReason(kind, media);
  if (reason) return reason;
  if (promptRequired(kind) && !prompt.trim()) return "Saisissez un prompt.";
  if (promptTooLong) return "Le prompt dépasse la longueur autorisée.";
  return null;
}

/** Corps de `POST /api/generations` pour le mode et les paramètres courants. */
export function buildGenerationInput(
  kind: GenerationKind,
  params: GenerationParams,
  prompt: string,
  negativePrompt: string,
  media: Media | null,
): GenerationIn {
  const visible = visibleParams(kind, params);
  const needsSource = modeInfo(kind).source !== null;
  return {
    kind,
    prompt: prompt.trim(),
    negative_prompt: negativePrompt.trim(),
    aspect_ratio: visible.aspectRatio ? params.aspectRatio : null,
    duration: params.duration,
    mode: kind === "omni_video" ? "pro" : params.quality,
    count: kind === "text_to_image" ? Math.min(9, Math.max(1, Math.round(params.count))) : 1,
    source_media_id: needsSource ? (media?.id ?? null) : null,
    refer_type: params.referType,
    keep_original_sound: params.keepOriginalSound,
  };
}

/** Paramètres d'une génération passée (bouton « Réutiliser » de l'historique). */
export function paramsFromGeneration(parameters: Record<string, unknown>): GenerationParams {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fallback;
  const count = typeof parameters.count === "number" ? parameters.count : DEFAULT_PARAMS.count;
  return {
    aspectRatio: pick(parameters.aspect_ratio, ASPECT_RATIOS, "16:9"),
    duration: pick(parameters.duration, ["5", "10"] as const, DEFAULT_PARAMS.duration),
    quality: pick(parameters.mode, ["std", "pro"] as const, DEFAULT_PARAMS.quality),
    count: Math.min(9, Math.max(1, Math.round(count))),
    referType: pick(parameters.refer_type, ["base", "feature"] as const, DEFAULT_PARAMS.referType),
    keepOriginalSound:
      typeof parameters.keep_original_sound === "boolean"
        ? parameters.keep_original_sound
        : DEFAULT_PARAMS.keepOriginalSound,
  };
}
