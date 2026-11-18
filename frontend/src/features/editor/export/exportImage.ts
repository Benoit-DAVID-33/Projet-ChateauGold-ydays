/**
 * Export PNG à la résolution NATIVE : média (frame courante pour une vidéo)
 * + annotations visibles à cet instant, dessinées une seule fois et sans
 * poignées (l'original étirait le canvas d'écran puis redessinait par-dessus).
 */
import type { TextMeasurer } from "../model/text";
import type { AnnotationElement } from "../model/types";
import {
  canvasToBlob,
  composeFrame,
  createCanvas as defaultCreateCanvas,
  get2dContext,
  renderAnnotationLayer,
  type CanvasFactory,
} from "./compose";

export interface ExportImageInput {
  media: HTMLImageElement | HTMLVideoElement;
  elements: readonly AnnotationElement[];
  /** Instant de la frame (vidéo) ; 0 pour une image. */
  time: number;
  measure: TextMeasurer;
  createCanvas?: CanvasFactory;
}

/** Dimensions natives si le média est prêt à être dessiné, sinon `null`. */
export function readyMediaSize(
  media: HTMLImageElement | HTMLVideoElement,
): { width: number; height: number } | null {
  if (media instanceof HTMLVideoElement) {
    const ready = media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    return ready && media.videoWidth > 0
      ? { width: media.videoWidth, height: media.videoHeight }
      : null;
  }
  return media.complete && media.naturalWidth > 0
    ? { width: media.naturalWidth, height: media.naturalHeight }
    : null;
}

export async function exportAnnotatedImage(input: ExportImageInput): Promise<Blob> {
  const { media, elements, time, measure, createCanvas = defaultCreateCanvas } = input;
  const size = readyMediaSize(media);
  if (!size) {
    throw new Error(
      media instanceof HTMLVideoElement
        ? "Veuillez attendre que la vidéo soit chargée."
        : "Veuillez attendre que l'image soit complètement chargée.",
    );
  }
  const { width, height } = size;
  const output = createCanvas(width, height);
  const layer = createCanvas(width, height);
  renderAnnotationLayer(get2dContext(layer), width, height, elements, time, measure);
  composeFrame(get2dContext(output), media, layer, width, height);
  return canvasToBlob(output, "image/png");
}
