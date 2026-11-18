/**
 * Création des éléments. Les tailles par défaut d'origine (en pixels écran)
 * sont converties en pixels natifs via `unitsPerPx` (pixels natifs par pixel
 * écran au moment de la création).
 */
import { UI_PX } from "./constants";
import { baselineFromTop } from "./text";
import type {
  LineElement,
  LineKind,
  Point,
  Shape3DElement,
  Shape3DKind,
  ShapeElement,
  ShapeKind,
  StrokeElement,
  StrokeTool,
  TextElement,
} from "./types";

export interface CreationContext {
  /** Centre de placement (pixels natifs), en général le centre de la zone visible. */
  center: Point;
  /** Pixels natifs par pixel écran. */
  unitsPerPx: number;
  /** Couleur courante de la palette. */
  color: string;
  /** Temps vidéo courant (0 pour une image). */
  time: number;
}

/** Identifiant au format d'origine : `<préfixe>_<horodatage>_<aléa>`. */
export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function base(ctx: CreationContext, strokePx: number) {
  return {
    color: ctx.color,
    strokeWidth: strokePx * ctx.unitsPerPx,
    startTime: ctx.time,
    endTime: null,
    motionTracking: false,
  };
}

function centeredBox(ctx: CreationContext, sizePx: number) {
  const size = sizePx * ctx.unitsPerPx;
  return { x: ctx.center.x - size / 2, y: ctx.center.y - size / 2, width: size, height: size };
}

export function createShape(shape: ShapeKind, ctx: CreationContext): ShapeElement {
  return {
    id: createId("shape"),
    type: "shape",
    shape,
    ...base(ctx, UI_PX.shapeStroke),
    ...centeredBox(ctx, UI_PX.shapeSize),
  };
}

export function createShape3D(shape: Shape3DKind, ctx: CreationContext): Shape3DElement {
  const size = shape === "hexagon3d" ? UI_PX.hexagon3dSize : UI_PX.shape3dSize;
  return {
    id: createId("shape3d"),
    type: "shape3d",
    shape,
    ...base(ctx, UI_PX.shape3dStroke),
    ...centeredBox(ctx, size),
    rotationX: 0,
    rotationY: 0,
  };
}

export function createLine(line: LineKind, ctx: CreationContext): LineElement {
  const half = UI_PX.lineHalfLength * ctx.unitsPerPx;
  return {
    id: createId("line"),
    type: "line",
    line,
    ...base(ctx, UI_PX.lineStroke),
    start: { x: ctx.center.x - half, y: ctx.center.y },
    end: { x: ctx.center.x + half, y: ctx.center.y },
  };
}

/** Texte dont le coin haut-gauche de la boîte est au point cliqué (comme l'original). */
export function createText(
  text: string,
  topLeft: Point,
  fontSizePx: number,
  ctx: CreationContext,
): TextElement {
  const fontSize = fontSizePx * ctx.unitsPerPx;
  return {
    id: createId("text"),
    type: "text",
    text,
    ...base(ctx, UI_PX.textOutline),
    fontSize,
    x: topLeft.x,
    y: baselineFromTop(topLeft.y, fontSize),
  };
}

/** Tracé libre (crayon, feutre, gomme) ; l'épaisseur est celle du curseur « Épaisseur ». */
export function createStroke(
  tool: StrokeTool,
  first: Point,
  brushPx: number,
  ctx: CreationContext,
): StrokeElement {
  return {
    id: createId("stroke"),
    type: "stroke",
    tool,
    ...base(ctx, brushPx),
    points: [first],
  };
}
