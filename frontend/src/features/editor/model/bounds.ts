/** Rectangles d'édition et emprises dessinées des éléments. */
import { boundsOfPoints, inflateRect, unionRect, type Rect } from "./geometry";
import { linePolyline, lineMetrics } from "./lines";
import { shape3dDrawnBounds } from "./shape3d";
import { textBounds, type TextMeasurer } from "./text";
import type { AnnotationElement } from "./types";

/**
 * Rectangle porteur des 8 poignées (formes, 3D, texte) ; `null` pour les
 * lignes (poignées aux extrémités) et les tracés libres (pas de poignées).
 */
export function elementBox(el: AnnotationElement, measure: TextMeasurer): Rect | null {
  switch (el.type) {
    case "shape":
    case "shape3d":
      return { x: el.x, y: el.y, width: el.width, height: el.height };
    case "text":
      return textBounds(el, measure);
    case "line":
    case "stroke":
      return null;
  }
}

/** Emprise visuelle approximative (badge, contour de sélection, export). */
export function elementBounds(el: AnnotationElement, measure: TextMeasurer): Rect {
  switch (el.type) {
    case "shape":
      return { x: el.x, y: el.y, width: el.width, height: el.height };
    case "shape3d":
      return unionRect(
        { x: el.x, y: el.y, width: el.width, height: el.height },
        shape3dDrawnBounds(el),
      );
    case "text":
      return textBounds(el, measure);
    case "line": {
      const pts = linePolyline(el);
      const bounds = boundsOfPoints(el.line === "straight-arrow" ? [el.start, el.end] : pts);
      const pad = el.line === "straight-arrow" ? lineMetrics(el.strokeWidth).arrowHead : 0;
      return inflateRect(bounds, pad + el.strokeWidth / 2);
    }
    case "stroke":
      return inflateRect(boundsOfPoints(el.points), el.strokeWidth / 2);
  }
}
