/**
 * Composition d'une image exportée : média (ou frame vidéo) + calque
 * d'annotations rendu UNE seule fois, sans poignées. Le calque est séparé pour
 * que la gomme (`destination-out`) n'efface jamais le média.
 */
import type { TextMeasurer } from "../model/text";
import type { AnnotationElement } from "../model/types";
import type { Ctx2D } from "../render/context";
import { renderScene } from "../render/scene";

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export const createCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le rendu Canvas 2D n'est pas disponible dans ce navigateur.");
  return ctx;
}

/** Contexte minimal pour composer une frame (testable avec un faux contexte). */
export type ComposeCtx = Pick<CanvasRenderingContext2D, "clearRect" | "drawImage">;

/** Rend les annotations visibles à `time` sur un calque transparent (repère natif). */
export function renderAnnotationLayer(
  ctx: Ctx2D & Pick<CanvasRenderingContext2D, "setTransform" | "clearRect">,
  width: number,
  height: number,
  elements: readonly AnnotationElement[],
  time: number,
  measure: TextMeasurer,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  renderScene(ctx, elements, { time, mode: "export", measure });
}

/** Dessine le média puis le calque d'annotations, à la taille native. */
export function composeFrame(
  ctx: ComposeCtx,
  source: CanvasImageSource,
  layer: CanvasImageSource,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  ctx.drawImage(layer, 0, 0, width, height);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Erreur lors de la création de l'image."));
      }, type);
    } catch (error) {
      reject(toExportError(error));
    }
  });
}

/** Message clair si le canvas est « contaminé » (média d'une autre origine sans CORS). */
export function toExportError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "SecurityError") {
    return new Error("Export impossible : le média provient d'une autre origine (CORS).");
  }
  return error instanceof Error ? error : new Error(String(error));
}
