/**
 * Interface 2D minimale utilisée par les fonctions de dessin. Un vrai
 * `CanvasRenderingContext2D` la satisfait ; les tests utilisent un contexte
 * d'enregistrement (aucun canvas réel nécessaire).
 */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "closePath"
  | "moveTo"
  | "lineTo"
  | "quadraticCurveTo"
  | "arc"
  | "fill"
  | "stroke"
  | "fillRect"
  | "strokeRect"
  | "fillText"
  | "strokeText"
  | "setLineDash"
  | "createRadialGradient"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "lineJoin"
  | "globalAlpha"
  | "globalCompositeOperation"
  | "font"
  | "textAlign"
  | "textBaseline"
>;

/** Réinitialise l'état de dessin partagé par toutes les annotations. */
export function resetDrawingState(ctx: Ctx2D): void {
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

/** Trace un polygone fermé (sans fill/stroke). */
export function tracePolygon(ctx: Ctx2D, points: readonly { x: number; y: number }[]): void {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const p of rest) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}
