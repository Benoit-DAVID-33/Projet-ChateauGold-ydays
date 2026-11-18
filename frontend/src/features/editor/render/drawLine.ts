/** Lignes : flèche, courbe, ligne torsadée (formules d'origine, état isolé par save/restore). */
import { arrowHead, curveControlPoint, lineMetrics, zigzagPoints } from "../model/lines";
import type { LineElement } from "../model/types";
import { resetDrawingState, tracePolygon, type Ctx2D } from "./context";

export function drawLine(ctx: Ctx2D, el: LineElement): void {
  const { start, end } = el;
  const metrics = lineMetrics(el.strokeWidth);
  ctx.save();
  resetDrawingState(ctx);
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  if (el.line === "curved") {
    const c = curveControlPoint(start, end);
    ctx.quadraticCurveTo(c.x, c.y, end.x, end.y);
    ctx.stroke();
  } else if (el.line === "zigzag") {
    const [, ...rest] = zigzagPoints(start, end, metrics.zigzagAmplitude, metrics.zigzagSegment);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else {
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    tracePolygon(ctx, arrowHead(start, end, metrics.arrowHead));
    ctx.fill();
  }
  ctx.restore();
}
