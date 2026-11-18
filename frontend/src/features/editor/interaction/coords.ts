/**
 * Conversions entre pixels écran et pixels natifs. Le rectangle de référence est celui du
 * calque d'annotations (`getBoundingClientRect`, zoom compris) : la conversion
 * reste juste quels que soient le zoom, le défilement et la taille de fenêtre.
 */
import type { MediaInfo, Point } from "../model/types";

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewMetrics {
  rect: ScreenRect;
  info: Pick<MediaInfo, "width" | "height">;
}

export function clientToNative(
  { rect, info }: ViewMetrics,
  clientX: number,
  clientY: number,
): Point {
  return {
    x: ((clientX - rect.left) * info.width) / rect.width,
    y: ((clientY - rect.top) * info.height) / rect.height,
  };
}

export function nativeToClient({ rect, info }: ViewMetrics, p: Point): Point {
  return {
    x: rect.left + (p.x * rect.width) / info.width,
    y: rect.top + (p.y * rect.height) / info.height,
  };
}

/** Pixels natifs par pixel écran. */
export const unitsPerPx = ({ rect, info }: ViewMetrics): number =>
  rect.width > 0 ? info.width / rect.width : 1;

/** Centre de la partie visible du média (intersection avec la zone défilante). */
export function visibleCenter(metrics: ViewMetrics, viewport: ScreenRect | null): Point {
  const r = metrics.rect;
  const v = viewport ?? r;
  const left = Math.max(r.left, v.left);
  const right = Math.min(r.left + r.width, v.left + v.width);
  const top = Math.max(r.top, v.top);
  const bottom = Math.min(r.top + r.height, v.top + v.height);
  const cx = right > left ? (left + right) / 2 : r.left + r.width / 2;
  const cy = bottom > top ? (top + bottom) / 2 : r.top + r.height / 2;
  return clientToNative(metrics, cx, cy);
}
