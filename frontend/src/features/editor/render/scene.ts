/**
 * Rendu d'une scène d'annotations — UNE seule implémentation pour l'écran et
 * l'export (l'original dupliquait les tracés, avec des écarts).
 * Le contexte doit déjà être transformé dans le repère natif du média.
 */
import type { TextMeasurer } from "../model/text";
import { isVisibleAt, type AnnotationElement } from "../model/types";
import type { Ctx2D } from "./context";
import { drawLine } from "./drawLine";
import { drawMotionBadge, drawSelection } from "./drawSelection";
import { drawShape } from "./drawShape";
import { drawShape3D } from "./drawShape3D";
import { drawStroke } from "./drawStroke";
import { drawText } from "./drawText";

export interface SceneOptions {
  /** Instant (s) : seuls les éléments visibles à cet instant sont dessinés. */
  time: number;
  /** `export` : annotations seules, sans poignées ni badges. */
  mode: "screen" | "export";
  selectedId?: string | null;
  /** Pixels natifs par pixel écran (taille des décorations d'écran). */
  unitsPerPx?: number;
  measure: TextMeasurer;
}

export function drawElement(ctx: Ctx2D, el: AnnotationElement): void {
  switch (el.type) {
    case "shape":
      return drawShape(ctx, el);
    case "shape3d":
      return drawShape3D(ctx, el);
    case "line":
      return drawLine(ctx, el);
    case "text":
      return drawText(ctx, el);
    case "stroke":
      return drawStroke(ctx, el);
  }
}

export function renderScene(
  ctx: Ctx2D,
  elements: readonly AnnotationElement[],
  options: SceneOptions,
): void {
  const visible = elements.filter((el) => isVisibleAt(el, options.time));
  for (const el of visible) drawElement(ctx, el);
  if (options.mode !== "screen") return;

  const unit = options.unitsPerPx ?? 1;
  for (const el of visible) {
    if (el.motionTracking) drawMotionBadge(ctx, el, unit, options.measure);
  }
  const selected = visible.find((el) => el.id === options.selectedId);
  if (selected) drawSelection(ctx, selected, unit, options.measure);
}
