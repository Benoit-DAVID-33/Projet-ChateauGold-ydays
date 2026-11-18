/** Temporalité des annotations (vidéo) : visibilité, suppression horodatée, fenêtres. */
import { clamp } from "./geometry";
import { isVisibleAt, type AnnotationElement } from "./types";

/** Durée minimale d'une fenêtre [startTime, endTime) éditée dans la chronologie (s). */
export const MIN_WINDOW = 0.1;
/** En deçà de cet écart avec la durée, la fin vaut « jusqu'à la fin » (endTime = null). */
const END_EPSILON = 1e-3;

export interface TimeWindow {
  startTime: number;
  endTime: number | null;
}

export function visibleElements(
  elements: readonly AnnotationElement[],
  time: number,
): AnnotationElement[] {
  return elements.filter((el) => isVisibleAt(el, time));
}

/**
 * Suppression d'un élément.
 * - Image : retrait définitif.
 * - Vidéo, élément visible à `time` : fin de vie à `time` (il reste visible avant).
 * - Vidéo, `time <= startTime` ou élément déjà terminé : retrait définitif
 *   (tronquer n'aurait aucun effet visible, voire prolongerait la fenêtre).
 */
export function deleteElementAt(
  elements: readonly AnnotationElement[],
  id: string,
  kind: "image" | "video",
  time: number,
): AnnotationElement[] {
  const target = elements.find((el) => el.id === id);
  if (!target) return [...elements];
  if (kind === "image" || time <= target.startTime || !isVisibleAt(target, time)) {
    return elements.filter((el) => el.id !== id);
  }
  return elements.map((el) => (el.id === id ? { ...el, endTime: time } : el));
}

const endOrNull = (end: number, duration: number) => (end >= duration - END_EPSILON ? null : end);

/** Borne une fenêtre dans [0, durée] avec une longueur minimale. */
export function normalizeWindow(
  window: TimeWindow,
  duration: number,
  minSpan = MIN_WINDOW,
): TimeWindow {
  const startTime = clamp(window.startTime, 0, Math.max(0, duration - minSpan));
  if (window.endTime === null) return { startTime, endTime: null };
  const end = clamp(window.endTime, startTime + minSpan, duration);
  return { startTime, endTime: endOrNull(end, duration) };
}

/** Déplace le bord de début ou de fin d'une fenêtre jusqu'à `time` (bornes respectées). */
export function retimeEdge(
  base: TimeWindow,
  edge: "start" | "end",
  time: number,
  duration: number,
  minSpan = MIN_WINDOW,
): TimeWindow {
  if (edge === "start") {
    const end = base.endTime ?? duration;
    return { startTime: clamp(time, 0, Math.max(0, end - minSpan)), endTime: base.endTime };
  }
  const end = clamp(time, base.startTime + minSpan, duration);
  return { startTime: base.startTime, endTime: endOrNull(end, duration) };
}

/** Décale toute la fenêtre de `delta` secondes sans changer sa longueur. */
export function shiftWindow(base: TimeWindow, delta: number, duration: number): TimeWindow {
  const span = (base.endTime ?? duration) - base.startTime;
  const startTime = clamp(base.startTime + delta, 0, Math.max(0, duration - span));
  return { startTime, endTime: endOrNull(startTime + span, duration) };
}

/** Pas des graduations : au plus ~10 repères sur la durée. */
export function rulerStep(duration: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  return steps.find((step) => duration / step <= 10) ?? 3600;
}

/** Temps correspondant à une abscisse écran dans une zone [left, left + width]. */
export function timeAtClientX(
  clientX: number,
  rect: { left: number; width: number },
  duration: number,
): number {
  return rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) * duration : 0;
}
