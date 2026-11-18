/**
 * Objets « 3D » (cube, bille, hexagone 3D) : mathématiques d'origine.
 * Les teintes or fixes d'origine sont dérivées de la couleur de l'élément
 * (pour #FFD700 le rendu reste très proche de l'original).
 */
import { darken, lighten, rgba, rgbaString } from "../model/color";
import { cubeFaces, hexPrism, sphereGeometry, type Projected } from "../model/shape3d";
import type { Shape3DElement } from "../model/types";
import { resetDrawingState, tracePolygon, type Ctx2D } from "./context";

const toPoints = (pts: readonly Projected[]) => pts.map((p) => ({ x: p.sx, y: p.sy }));

function drawCube(ctx: Ctx2D, el: Shape3DElement): void {
  for (const face of cubeFaces(el)) {
    ctx.fillStyle = rgba(el.color, face.alpha);
    tracePolygon(ctx, toPoints(face.points));
    ctx.fill();
    ctx.stroke();
  }
}

function drawSphere(ctx: Ctx2D, el: Shape3DElement): void {
  const g = sphereGeometry(el);
  const { highlight: h, shadow: s } = g;
  const light = ctx.createRadialGradient(h.x0, h.y0, h.r0, h.x1, h.y1, h.r1);
  light.addColorStop(0, rgbaString(lighten(el.color, 0.85), 0.95));
  light.addColorStop(0.4, rgbaString(lighten(el.color, 0.5), 0.6));
  light.addColorStop(0.7, rgba(el.color, 0.4));
  light.addColorStop(1, rgbaString(darken(el.color, 0.3), 0.5));
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  ctx.fill();

  const shade = ctx.createRadialGradient(s.x0, s.y0, s.r0, s.x1, s.y1, s.r1);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.6, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, rgbaString(darken(el.color, 0.7), 0.35));
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawHexPrism(ctx: Ctx2D, el: Shape3DElement): void {
  const { back, front, backFirst } = hexPrism(el);
  const drawBackAndEdges = () => {
    ctx.fillStyle = rgba(el.color, 0.25);
    tracePolygon(ctx, toPoints(back));
    ctx.fill();
    ctx.stroke();
    back.forEach((b, i) => {
      const f = front[i]!;
      ctx.beginPath();
      ctx.moveTo(b.sx, b.sy);
      ctx.lineTo(f.sx, f.sy);
      ctx.stroke();
    });
  };
  if (backFirst) drawBackAndEdges();
  ctx.fillStyle = rgba(el.color, 0.5);
  tracePolygon(ctx, toPoints(front));
  ctx.fill();
  ctx.stroke();
  if (!backFirst) drawBackAndEdges();
}

export function drawShape3D(ctx: Ctx2D, el: Shape3DElement): void {
  ctx.save();
  resetDrawingState(ctx);
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineJoin = "round";
  if (el.shape === "cube") drawCube(ctx, el);
  else if (el.shape === "sphere") drawSphere(ctx, el);
  else drawHexPrism(ctx, el);
  ctx.restore();
}
