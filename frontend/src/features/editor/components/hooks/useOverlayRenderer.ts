/**
 * Redessine le calque d'annotations (une fois par frame au plus) quand les
 * éléments, la sélection ou le temps vidéo changent, ou quand sa taille change
 * (ResizeObserver). Bitmap = taille CSS × devicePixelRatio (net en HiDPI),
 * plafonné pour les forts zooms ; le contexte est transformé dans le repère
 * natif du média, donc le rendu suit exactement le zoom.
 */
import { useEffect, type RefObject } from "react";

import type { TextMeasurer } from "../../model/text";
import type { MediaInfo } from "../../model/types";
import { renderScene } from "../../render/scene";
import { useEditorStore, type EditorState } from "../../store/editorStore";

/** Plafond de surface du bitmap (≈ 32 Mo) pour les forts zooms. */
const MAX_BITMAP_PIXELS = 8_000_000;

export function bitmapRatio(cssWidth: number, cssHeight: number, dpr: number): number {
  const area = cssWidth * cssHeight;
  if (area <= 0) return 1;
  return Math.max(0.1, Math.min(dpr, Math.sqrt(MAX_BITMAP_PIXELS / area)));
}

const needsRedraw = (s: EditorState, prev: EditorState) =>
  s.elements !== prev.elements ||
  s.selectedId !== prev.selectedId ||
  s.currentTime !== prev.currentTime;

export function useOverlayRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  info: MediaInfo | null,
  measure: TextMeasurer,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !info) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;

    const draw = () => {
      frame = 0;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (!cssWidth || !cssHeight) return;
      const ratio = bitmapRatio(cssWidth, cssHeight, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(width / info.width, 0, 0, height / info.height, 0, 0);
      const s = useEditorStore.getState();
      renderScene(ctx, s.elements, {
        time: s.currentTime,
        mode: "screen",
        selectedId: s.selectedId,
        unitsPerPx: info.width / cssWidth,
        measure,
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    schedule();
    const unsubscribe = useEditorStore.subscribe((s, prev) => {
      if (needsRedraw(s, prev)) schedule();
    });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(canvas);
    // Le changement de devicePixelRatio (zoom navigateur) déclenche un resize.
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [canvasRef, info, measure]);
}
