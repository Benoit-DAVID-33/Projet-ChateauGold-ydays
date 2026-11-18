/**
 * Décorations d'écran (jamais exportées) : poignées de sélection, contour des
 * tracés sélectionnés, badge « Motion Tracking ».
 * `unit` = pixels natifs par pixel écran, pour garder une taille constante à l'écran.
 */
import { elementBounds } from "../model/bounds";
import { HANDLE_FILL, HANDLE_STROKE, UI_PX } from "../model/constants";
import { getHandles } from "../model/handles";
import type { TextMeasurer } from "../model/text";
import type { AnnotationElement } from "../model/types";
import { resetDrawingState, type Ctx2D } from "./context";

export function drawSelection(
  ctx: Ctx2D,
  el: AnnotationElement,
  unit: number,
  measure: TextMeasurer,
): void {
  ctx.save();
  resetDrawingState(ctx);
  ctx.lineWidth = UI_PX.handleStroke * unit;
  if (el.type === "stroke") {
    // Pas de poignées pour un tracé : contour pointillé de l'emprise.
    const b = elementBounds(el, measure);
    ctx.strokeStyle = HANDLE_FILL;
    ctx.setLineDash([6 * unit, 4 * unit]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.width, b.y);
    ctx.lineTo(b.x + b.width, b.y + b.height);
    ctx.lineTo(b.x, b.y + b.height);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.fillStyle = HANDLE_FILL;
    ctx.strokeStyle = HANDLE_STROKE;
    for (const { point } of getHandles(el, measure)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, UI_PX.handleRadius * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Petit viseur en haut à droite de l'élément quand « Motion Tracking » est activé. */
export function drawMotionBadge(
  ctx: Ctx2D,
  el: AnnotationElement,
  unit: number,
  measure: TextMeasurer,
): void {
  const b = elementBounds(el, measure);
  const r = UI_PX.motionBadge * unit;
  const cx = b.x + b.width;
  const cy = b.y;
  ctx.save();
  resetDrawingState(ctx);
  ctx.fillStyle = "rgba(13, 13, 13, 0.8)";
  ctx.strokeStyle = HANDLE_FILL;
  ctx.lineWidth = 2 * unit;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy);
  ctx.lineTo(cx + r * 0.6, cy);
  ctx.moveTo(cx, cy - r * 0.6);
  ctx.lineTo(cx, cy + r * 0.6);
  ctx.stroke();
  ctx.restore();
}
