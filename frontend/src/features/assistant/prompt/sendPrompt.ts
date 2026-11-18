/**
 * Prompt réellement transmis par « Envoyer à l'API » (`sendToAPIHandler`
 * d'origine) : intention de l'utilisateur, puis « Éléments placés sur la
 * vidéo: » (ou « sur l'image: ») et la description française des éléments.
 */
import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { analyzeElements } from "./analyze";
import { renderDescription } from "./describe";
import { mediaNounFr } from "./format";
import type { ElementsAnalysis } from "./types";

/** Légende du repère, ajoutée sous l'en-tête (les % sont mesurés au centre). */
export function coordinatesNoteFr({ media }: ElementsAnalysis): string {
  const noun = media.kind === "video" ? "vidéo" : "image";
  return `(Repère : ${noun} ${media.width}×${media.height} px ; positions en % de la largeur et de la hauteur, mesurées au centre de chaque élément.)`;
}

/** Rend le prompt envoyé à partir d'une analyse. */
export function renderSendPrompt(analysis: ElementsAnalysis, userIntent: string): string {
  const intent = userIntent.trim();
  if (analysis.summary.totalElements === 0) return intent;
  const block =
    `Éléments placés sur ${mediaNounFr(analysis.media)}:\n` +
    `${coordinatesNoteFr(analysis)}\n` +
    renderDescription(analysis).trimEnd();
  return intent ? `${intent}\n\n${block}` : block;
}

/**
 * Prompt envoyé à l'API : `intention + "\n\nÉléments placés sur la vidéo:\n" +
 * description` (« l'image » pour une image). Sans élément visible : l'intention
 * seule. `mediaInfo` null : image 1280×720.
 */
export function buildSendPrompt(
  userIntent: string,
  elements: readonly AnnotationElement[],
  mediaInfo: MediaInfo | null | undefined,
): string {
  return renderSendPrompt(analyzeElements(elements, mediaInfo), userIntent);
}
