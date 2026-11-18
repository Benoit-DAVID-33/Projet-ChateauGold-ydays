/**
 * Mesure de texte via un canvas hors écran (police de l'élément), avec cache.
 * Mesure à 100 px puis mise à l'échelle linéaire : cohérent avec le
 * redimensionnement proportionnel. Repli approximatif sans canvas (tests, SSR).
 */
import { approximateTextWidth, textFont, type TextMeasurer } from "../model/text";

const REFERENCE_SIZE = 100;
const CACHE_LIMIT = 500;

export function createCanvasTextMeasurer(): TextMeasurer {
  let ctx: CanvasRenderingContext2D | null | undefined;
  const cache = new Map<string, number>();
  return (text, fontSize) => {
    if (ctx === undefined) {
      try {
        ctx =
          typeof document === "undefined"
            ? null
            : document.createElement("canvas").getContext("2d");
      } catch {
        ctx = null;
      }
    }
    if (!ctx) return approximateTextWidth(text, fontSize);
    let width = cache.get(text);
    if (width === undefined) {
      ctx.font = textFont(REFERENCE_SIZE);
      width = ctx.measureText(text).width;
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(text, width);
    }
    return (width * fontSize) / REFERENCE_SIZE;
  };
}

/** Instance partagée (le canvas de mesure est créé au premier usage). */
export const measureText: TextMeasurer = createCanvasTextMeasurer();
