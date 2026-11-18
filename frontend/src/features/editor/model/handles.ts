/** Poignées de redimensionnement : 8 autour des boîtes, 2 aux extrémités des lignes. */
import { elementBox } from "./bounds";
import { distance } from "./geometry";
import type { TextMeasurer } from "./text";
import type { AnnotationElement, Point } from "./types";

export type BoxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type LineHandle = "start" | "end";
export type HandleId = BoxHandle | LineHandle;

export const BOX_HANDLES: readonly BoxHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export interface Handle {
  id: HandleId;
  point: Point;
}

/** Curseurs d'origine au survol d'une poignée. */
export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nw-resize",
  n: "n-resize",
  ne: "ne-resize",
  e: "e-resize",
  se: "se-resize",
  s: "s-resize",
  sw: "sw-resize",
  w: "w-resize",
  start: "nw-resize",
  end: "se-resize",
};

export const isBoxHandle = (id: HandleId): id is BoxHandle => id !== "start" && id !== "end";

export function getHandles(el: AnnotationElement, measure: TextMeasurer): Handle[] {
  if (el.type === "line") {
    return [
      { id: "start", point: el.start },
      { id: "end", point: el.end },
    ];
  }
  const box = elementBox(el, measure);
  if (!box) return [];
  const { x, y, width: w, height: h } = box;
  const points: Record<BoxHandle, Point> = {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  };
  return BOX_HANDLES.map((id) => ({ id, point: points[id] }));
}

/** Poignée la plus proche du point, dans la tolérance (pixels natifs). */
export function hitTestHandle(
  el: AnnotationElement,
  p: Point,
  tolerance: number,
  measure: TextMeasurer,
): HandleId | null {
  let best: HandleId | null = null;
  let bestDistance = tolerance;
  for (const handle of getHandles(el, measure)) {
    const d = distance(p, handle.point);
    if (d <= bestDistance) {
      best = handle.id;
      bestDistance = d;
    }
  }
  return best;
}
