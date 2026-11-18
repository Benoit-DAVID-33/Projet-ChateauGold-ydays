/**
 * Hit-testing sur la géométrie réelle de chaque élément (l'original utilisait
 * la boîte englobante pour toutes les formes et le segment droit pour les
 * courbes et zigzags).
 */
import { distance, distanceToPolyline, pointInPolygon, rectContains } from "./geometry";
import { linePolyline } from "./lines";
import { shape3dDrawnBounds } from "./shape3d";
import { inscribedCircle, shapePolygon } from "./shapes";
import { textBounds, type TextMeasurer } from "./text";
import { isVisibleAt, type AnnotationElement, type Point } from "./types";

export interface HitOptions {
  /** Tolérance autour des formes et textes (pixels natifs). */
  tolerance: number;
  /** Tolérance autour des lignes et tracés (pixels natifs). */
  lineTolerance: number;
  measure: TextMeasurer;
}

export function hitTestElement(el: AnnotationElement, p: Point, opts: HitOptions): boolean {
  switch (el.type) {
    case "shape": {
      const rect = { x: el.x, y: el.y, width: el.width, height: el.height };
      const tol = opts.tolerance + el.strokeWidth / 2;
      if (el.shape === "circle") {
        const c = inscribedCircle(rect);
        return distance(p, { x: c.cx, y: c.cy }) <= c.r + tol;
      }
      const polygon = shapePolygon(el.shape, rect);
      if (!polygon) return rectContains(rect, p, tol); // carré arrondi
      return pointInPolygon(p, polygon) || distanceToPolyline(p, polygon, true) <= tol;
    }
    case "shape3d": {
      const tol = opts.tolerance + el.strokeWidth / 2;
      if (el.shape === "sphere") {
        const c = inscribedCircle(el);
        return distance(p, { x: c.cx, y: c.cy }) <= c.r + tol;
      }
      return rectContains(el, p, tol) || rectContains(shape3dDrawnBounds(el), p, tol);
    }
    case "line":
      return distanceToPolyline(p, linePolyline(el)) <= opts.lineTolerance + el.strokeWidth / 2;
    case "text":
      return rectContains(textBounds(el, opts.measure), p, opts.tolerance);
    case "stroke":
      // Les coups de gomme sont invisibles : ils ne se sélectionnent pas.
      if (el.tool === "eraser") return false;
      return distanceToPolyline(p, el.points) <= Math.max(opts.lineTolerance, el.strokeWidth / 2);
  }
}

/** Élément visible le plus haut (dernier dessiné) sous le point, à l'instant t. */
export function findElementAt(
  elements: readonly AnnotationElement[],
  p: Point,
  time: number,
  opts: HitOptions,
): AnnotationElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (isVisibleAt(el, time) && hitTestElement(el, p, opts)) return el;
  }
  return null;
}
