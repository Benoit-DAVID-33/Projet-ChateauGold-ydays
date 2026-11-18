/** Formes 2D : remplissage couleur à 55 % puis contour (rendu d'origine, couleur paramétrable). */
import { rgba } from "../model/color";
import { SHAPE_FILL_ALPHA } from "../model/constants";
import { inscribedCircle, roundedCornerRadius, shapePolygon } from "../model/shapes";
import type { ShapeElement } from "../model/types";
import { resetDrawingState, tracePolygon, type Ctx2D } from "./context";

function traceRoundedSquare(ctx: Ctx2D, el: ShapeElement): void {
  const { x, y, width: w, height: h } = el;
  const r = roundedCornerRadius(el);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawShape(ctx: Ctx2D, el: ShapeElement): void {
  ctx.save();
  resetDrawingState(ctx);
  ctx.strokeStyle = el.color;
  ctx.fillStyle = rgba(el.color, SHAPE_FILL_ALPHA);
  ctx.lineWidth = el.strokeWidth;
  if (el.shape === "square") {
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeRect(el.x, el.y, el.width, el.height);
    ctx.restore();
    return;
  }
  if (el.shape === "rounded-square") {
    traceRoundedSquare(ctx, el);
  } else if (el.shape === "circle") {
    const c = inscribedCircle(el);
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
  } else {
    tracePolygon(ctx, shapePolygon(el.shape, el) ?? []);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
