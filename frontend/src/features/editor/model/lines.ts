/** Géométrie des 3 types de lignes (formules d'origine, longueur nulle sécurisée). */
import { LINE_GEOMETRY } from "./constants";
import { distance } from "./geometry";
import type { LineElement, Point } from "./types";

/** Longueurs dérivées de l'épaisseur (cf. LINE_GEOMETRY). */
export function lineMetrics(strokeWidth: number) {
  return {
    arrowHead: strokeWidth * LINE_GEOMETRY.arrowHeadPerWidth,
    zigzagAmplitude: strokeWidth * LINE_GEOMETRY.zigzagAmplitudePerWidth,
    zigzagSegment: strokeWidth * LINE_GEOMETRY.zigzagSegmentPerWidth,
  };
}

/** Tête de flèche pleine en `end` : [pointe, aile 1, aile 2] (demi-angle π/6). */
export function arrowHead(start: Point, end: Point, length: number): [Point, Point, Point] {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const a = LINE_GEOMETRY.arrowHalfAngle;
  return [
    end,
    { x: end.x - length * Math.cos(angle - a), y: end.y - length * Math.sin(angle - a) },
    { x: end.x - length * Math.cos(angle + a), y: end.y - length * Math.sin(angle + a) },
  ];
}

/** Point de contrôle de la courbe : milieu + 0,3 × (dy, −dx). */
export function curveControlPoint(start: Point, end: Point): Point {
  const k = LINE_GEOMETRY.curveOffset;
  return {
    x: (start.x + end.x) / 2 + (end.y - start.y) * k,
    y: (start.y + end.y) / 2 - (end.x - start.x) * k,
  };
}

/** Échantillonne une Bézier quadratique (pour le hit-test). */
export function sampleQuadratic(p0: Point, c: Point, p1: Point, segments = 24): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    };
  });
}

/**
 * Points du zigzag d'origine : `max(3, floor(d / pas))` segments, alternance ±amplitude
 * le long de la normale (le dernier point est décalé, comme l'original).
 * Longueur nulle : renvoie le seul point de départ (l'original produisait NaN).
 */
export function zigzagPoints(
  start: Point,
  end: Point,
  amplitude: number,
  segmentLength: number,
): Point[] {
  const d = distance(start, end);
  if (d < 1e-9 || segmentLength <= 0) return [start];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const nx = -dy / d;
  const ny = dx / d;
  const segments = Math.max(3, Math.floor(d / segmentLength));
  const points: Point[] = [start];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const side = i % 2 === 0 ? amplitude : -amplitude;
    points.push({ x: start.x + t * dx + nx * side, y: start.y + t * dy + ny * side });
  }
  return points;
}

/** Polyligne représentant le tracé réel d'une ligne (sert au hit-test). */
export function linePolyline(line: LineElement): Point[] {
  const { start, end } = line;
  switch (line.line) {
    case "curved":
      return sampleQuadratic(start, curveControlPoint(start, end), end);
    case "zigzag": {
      const m = lineMetrics(line.strokeWidth);
      return zigzagPoints(start, end, m.zigzagAmplitude, m.zigzagSegment);
    }
    case "straight-arrow":
      return [start, end];
  }
}
