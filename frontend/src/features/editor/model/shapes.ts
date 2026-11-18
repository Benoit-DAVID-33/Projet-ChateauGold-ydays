/** Géométrie exacte des 7 formes 2D d'origine (dans leur rectangle x, y, width, height). */
import type { Rect } from "./geometry";
import type { Point, ShapeKind } from "./types";

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** Cercle inscrit (jamais d'ellipse, comme l'original) : rayon min(w, h) / 2. */
export function inscribedCircle(rect: Rect): Circle {
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    r: Math.min(rect.width, rect.height) / 2,
  };
}

/** Rayon des coins du carré arrondi : 20 % du plus petit côté. */
export const roundedCornerRadius = (rect: Rect): number => Math.min(rect.width, rect.height) * 0.2;

/** Hexagone régulier inscrit, sommets à i·π/3 (pointes à gauche et à droite). */
export function hexagonPoints(rect: Rect): Point[] {
  const { cx, cy, r } = inscribedCircle(rect);
  return Array.from({ length: 6 }, (_, i) => ({
    x: cx + r * Math.cos((Math.PI / 3) * i),
    y: cy + r * Math.sin((Math.PI / 3) * i),
  }));
}

/**
 * Contour polygonal d'une forme, ou `null` pour les formes courbes
 * (rond, carré arrondi) dessinées avec des arcs.
 */
export function shapePolygon(kind: ShapeKind, rect: Rect): Point[] | null {
  const { x, y, width: w, height: h } = rect;
  switch (kind) {
    case "square":
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    case "triangle":
      return [
        { x: x + w / 2, y },
        { x, y: y + h },
        { x: x + w, y: y + h },
      ];
    case "triangle-inverted":
      return [
        { x: x + w / 2, y: y + h },
        { x, y },
        { x: x + w, y },
      ];
    case "diamond":
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
      ];
    case "hexagon":
      return hexagonPoints(rect);
    case "circle":
    case "rounded-square":
      return null;
  }
}
