/**
 * Tracés libres modélisés (persistants, contrairement à l'original) :
 * - crayon : trait plein ;
 * - feutre : mode `multiply`, opacité 0,3 ;
 * - gomme : `destination-out` — n'efface que le calque d'annotations (jamais le média).
 */
import { MARKER_ALPHA } from "../model/constants";
import type { StrokeElement } from "../model/types";
import { resetDrawingState, type Ctx2D } from "./context";

export function drawStroke(ctx: Ctx2D, el: StrokeElement): void {
  const [first, ...rest] = el.points;
  if (!first) return;
  ctx.save();
  resetDrawingState(ctx);
  if (el.tool === "marker") {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = MARKER_ALPHA;
  } else if (el.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
  }
  const paint = el.tool === "eraser" ? "#000000" : el.color;
  ctx.strokeStyle = paint;
  ctx.fillStyle = paint;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (rest.length === 0) {
    // Simple clic : un point (disque) comme le tampon d'origine.
    ctx.arc(first.x, first.y, el.strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}
