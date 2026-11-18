/**
 * Transformations pures (déplacement, redimensionnement, rotation, molette).
 * Toutes partent d'un état de référence immuable : aucune dérive cumulée.
 */
import { ROTATION_SENSITIVITY } from "./constants";
import { boundsOfPoints, distance, rectCenter, type Rect } from "./geometry";
import type { BoxHandle, HandleId } from "./handles";
import { baselineFromTop, textBounds, type TextMeasurer } from "./text";
import type { AnnotationElement, Point, Shape3DElement, TextElement } from "./types";

export interface SizeLimits {
  /** Taille minimale d'une boîte / longueur minimale d'une ligne (pixels natifs). */
  minSize: number;
  /** Bornes de taille de police (pixels natifs). */
  minFontSize: number;
  maxFontSize: number;
  measure: TextMeasurer;
}

const shift = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy });

/**
 * Borne une valeur dans le sens de la variation seulement : un élément déjà
 * hors bornes (créé à un autre niveau de zoom) ne « saute » pas.
 */
export function clampToward(value: number, base: number, min: number, max: number): number {
  if (value >= base) return Math.min(value, Math.max(max, base));
  return Math.max(value, Math.min(min, base));
}

export function translateElement<T extends AnnotationElement>(el: T, dx: number, dy: number): T {
  switch (el.type) {
    case "line":
      return { ...el, start: shift(el.start, dx, dy), end: shift(el.end, dx, dy) };
    case "stroke":
      return { ...el, points: el.points.map((p) => shift(p, dx, dy)) };
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

/**
 * Redimensionne un rectangle par une poignée ; le côté opposé reste fixe et la
 * taille minimale bloque le bord mobile (corrige le glissement d'origine).
 */
export function resizeRect(
  base: Rect,
  handle: BoxHandle,
  dx: number,
  dy: number,
  minSize: number,
): Rect {
  const minW = Math.min(minSize, base.width);
  const minH = Math.min(minSize, base.height);
  let left = base.x;
  let right = base.x + base.width;
  let top = base.y;
  let bottom = base.y + base.height;
  if (handle.includes("w")) left = Math.min(left + dx, right - minW);
  if (handle.includes("e")) right = Math.max(right + dx, left + minW);
  if (handle.includes("n")) top = Math.min(top + dy, bottom - minH);
  if (handle.includes("s")) bottom = Math.max(bottom + dy, top + minH);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Texte : mise à l'échelle proportionnelle de la police, ancrée sur la poignée opposée. */
function resizeText(
  base: TextElement,
  handle: BoxHandle,
  dx: number,
  dy: number,
  limits: SizeLimits,
): TextElement {
  const box = textBounds(base, limits.measure);
  const target = resizeRect(box, handle, dx, dy, 1e-6);
  const sx = target.width / box.width;
  const sy = target.height / box.height;
  const horizontal = handle === "e" || handle === "w";
  const vertical = handle === "n" || handle === "s";
  const ratio = horizontal ? sx : vertical ? sy : (sx + sy) / 2;
  const fontSize = clampToward(
    base.fontSize * ratio,
    base.fontSize,
    limits.minFontSize,
    limits.maxFontSize,
  );
  const k = fontSize / base.fontSize;
  const width = box.width * k;
  const height = box.height * k;
  const left = handle.includes("w")
    ? box.x + box.width - width
    : handle.includes("e")
      ? box.x
      : box.x + (box.width - width) / 2;
  const top = handle.includes("n")
    ? box.y + box.height - height
    : handle.includes("s")
      ? box.y
      : box.y + (box.height - height) / 2;
  return { ...base, fontSize, x: left, y: baselineFromTop(top, fontSize) };
}

/** Applique le glissement (dx, dy) d'une poignée à partir de l'état de référence. */
export function resizeElement(
  base: AnnotationElement,
  handle: HandleId,
  dx: number,
  dy: number,
  limits: SizeLimits,
): AnnotationElement {
  switch (base.type) {
    case "line":
      if (handle === "start") return { ...base, start: shift(base.start, dx, dy) };
      if (handle === "end") return { ...base, end: shift(base.end, dx, dy) };
      return base;
    case "shape":
    case "shape3d":
      if (handle === "start" || handle === "end") return base;
      return { ...base, ...resizeRect(base, handle, dx, dy, limits.minSize) };
    case "text":
      if (handle === "start" || handle === "end") return base;
      return resizeText(base, handle, dx, dy, limits);
    case "stroke":
      return base;
  }
}

/** Rotation 3D : 0,012 rad par pixel écran (Y suit dx, X suit −dy). */
export function rotateShape3D(base: Shape3DElement, dxPx: number, dyPx: number): Shape3DElement {
  return {
    ...base,
    rotationY: base.rotationY + dxPx * ROTATION_SENSITIVITY,
    rotationX: base.rotationX - dyPx * ROTATION_SENSITIVITY,
  };
}

const scaleAround = (p: Point, c: Point, f: number): Point => ({
  x: c.x + (p.x - c.x) * f,
  y: c.y + (p.y - c.y) * f,
});

/** Mise à l'échelle à la molette (×1,1 / ×0,9) autour du centre, taille minimale respectée. */
export function scaleElement(
  el: AnnotationElement,
  factor: number,
  limits: SizeLimits,
): AnnotationElement {
  switch (el.type) {
    case "shape":
    case "shape3d": {
      const c = rectCenter(el);
      const width = Math.max(Math.min(limits.minSize, el.width), el.width * factor);
      const height = Math.max(Math.min(limits.minSize, el.height), el.height * factor);
      return { ...el, width, height, x: c.x - width / 2, y: c.y - height / 2 };
    }
    case "text": {
      const box = textBounds(el, limits.measure);
      const c = rectCenter(box);
      const fontSize = clampToward(
        el.fontSize * factor,
        el.fontSize,
        limits.minFontSize,
        limits.maxFontSize,
      );
      const k = fontSize / el.fontSize;
      const top = c.y - (box.height * k) / 2;
      return { ...el, fontSize, x: c.x - (box.width * k) / 2, y: baselineFromTop(top, fontSize) };
    }
    case "line": {
      if (factor < 1 && distance(el.start, el.end) * factor < limits.minSize) return el;
      const c = { x: (el.start.x + el.end.x) / 2, y: (el.start.y + el.end.y) / 2 };
      return {
        ...el,
        start: scaleAround(el.start, c, factor),
        end: scaleAround(el.end, c, factor),
      };
    }
    case "stroke": {
      const box = boundsOfPoints(el.points);
      if (factor < 1 && Math.max(box.width, box.height) * factor < limits.minSize) return el;
      const c = rectCenter(box);
      return { ...el, points: el.points.map((p) => scaleAround(p, c, factor)) };
    }
  }
}
