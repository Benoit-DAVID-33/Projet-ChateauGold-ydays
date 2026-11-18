/**
 * Machine à états des gestes, sans DOM : décision au pointerdown, application
 * au pointermove, curseur de survol. Le hook `usePointerInteraction` ne fait
 * que relier ces fonctions aux événements Pointer.
 */
import { FONT_SIZE, UI_PX } from "../model/constants";
import { HANDLE_CURSORS, hitTestHandle, type HandleId } from "../model/handles";
import { findElementAt, type HitOptions } from "../model/hitTest";
import type { TextMeasurer } from "../model/text";
import {
  resizeElement,
  rotateShape3D,
  translateElement,
  type SizeLimits,
} from "../model/transform";
import {
  isVisibleAt,
  type AnnotationElement,
  type Point,
  type Shape3DElement,
} from "../model/types";
import type { ActiveTool, EditorState } from "../store/editorStore";
import { selectSelectedElement } from "../store/selectors";

export type Gesture =
  | { kind: "move"; id: string; origin: Point; base: AnnotationElement }
  | { kind: "resize"; id: string; handle: HandleId; origin: Point; base: AnnotationElement }
  | { kind: "rotate"; id: string; originClient: Point; base: Shape3DElement }
  | { kind: "draw"; id: string; last: Point };

export type DownDecision =
  | { action: "place-text" }
  | { action: "draw" }
  | { action: "gesture"; gesture: Exclude<Gesture, { kind: "draw" }> }
  /** Rien sous le pointeur : désélection, l'événement continue vers le lecteur. */
  | { action: "pass-through" };

export interface PointerSample {
  /** Position en pixels natifs. */
  point: Point;
  /** Position écran (rotation en pixels écran). */
  client: Point;
  shiftKey: boolean;
  altKey: boolean;
}

export const hitOptions = (unitsPerPx: number, measure: TextMeasurer): HitOptions => ({
  tolerance: UI_PX.elementHit * unitsPerPx,
  lineTolerance: UI_PX.lineHit * unitsPerPx,
  measure,
});

export const sizeLimits = (unitsPerPx: number, measure: TextMeasurer): SizeLimits => ({
  minSize: UI_PX.minSize * unitsPerPx,
  minFontSize: FONT_SIZE.min * unitsPerPx,
  maxFontSize: FONT_SIZE.max * unitsPerPx,
  measure,
});

const rotateGesture = (el: Shape3DElement, client: Point): DownDecision => ({
  action: "gesture",
  gesture: { kind: "rotate", id: el.id, originClient: client, base: el },
});

/** Ce que doit faire un appui principal. Priorité : rotation armée, outil, poignée, élément. */
export function decidePointerDown(
  state: EditorState,
  sample: PointerSample,
  unitsPerPx: number,
  measure: TextMeasurer,
): DownDecision {
  const { point, client } = sample;
  const time = state.currentTime;
  const hit = () => findElementAt(state.elements, point, time, hitOptions(unitsPerPx, measure));

  if (state.rotateArmed) {
    const target = hit();
    if (target?.type === "shape3d") return rotateGesture(target, client);
  }
  if (state.tool.kind === "text") return { action: "place-text" };
  if (state.tool.kind === "stroke") return { action: "draw" };

  const selected = selectSelectedElement(state);
  if (selected && isVisibleAt(selected, time)) {
    const handle = hitTestHandle(selected, point, UI_PX.handleHit * unitsPerPx, measure);
    if (handle) {
      return {
        action: "gesture",
        gesture: { kind: "resize", id: selected.id, handle, origin: point, base: selected },
      };
    }
  }
  const target = hit();
  if (!target) return { action: "pass-through" };
  if (target.type === "shape3d" && (sample.shiftKey || sample.altKey)) {
    return rotateGesture(target, client);
  }
  return {
    action: "gesture",
    gesture: { kind: "move", id: target.id, origin: point, base: target },
  };
}

/** Nouvel état de l'élément pour un geste move / resize / rotate. */
export function applyGesture(
  gesture: Exclude<Gesture, { kind: "draw" }>,
  sample: PointerSample,
  unitsPerPx: number,
  measure: TextMeasurer,
): AnnotationElement {
  switch (gesture.kind) {
    case "move":
      return translateElement(
        gesture.base,
        sample.point.x - gesture.origin.x,
        sample.point.y - gesture.origin.y,
      );
    case "resize":
      return resizeElement(
        gesture.base,
        gesture.handle,
        sample.point.x - gesture.origin.x,
        sample.point.y - gesture.origin.y,
        sizeLimits(unitsPerPx, measure),
      );
    case "rotate":
      return rotateShape3D(
        gesture.base,
        sample.client.x - gesture.originClient.x,
        sample.client.y - gesture.originClient.y,
      );
  }
}

export interface HoverInfo {
  cursor: string;
  /** Vrai si le calque doit capter le pointeur (élément ou poignée sous le curseur). */
  overElement: boolean;
}

export const NO_HOVER: HoverInfo = { cursor: "default", overElement: false };

/** Survol hors outil : poignée de la sélection, puis élément. */
export function hoverAt(
  state: EditorState,
  point: Point,
  unitsPerPx: number,
  measure: TextMeasurer,
): HoverInfo {
  const selected = selectSelectedElement(state);
  if (selected && isVisibleAt(selected, state.currentTime)) {
    const handle = hitTestHandle(selected, point, UI_PX.handleHit * unitsPerPx, measure);
    if (handle) return { cursor: HANDLE_CURSORS[handle], overElement: true };
  }
  const target = findElementAt(
    state.elements,
    point,
    state.currentTime,
    hitOptions(unitsPerPx, measure),
  );
  return target ? { cursor: "move", overElement: true } : NO_HOVER;
}

/** Curseur imposé par l'outil actif (curseurs d'origine), sinon `null`. */
export function toolCursor(tool: ActiveTool, rotateArmed: boolean): string | null {
  if (rotateArmed) return "grab";
  if (tool.kind === "text") return "text";
  if (tool.kind === "stroke") return tool.tool === "eraser" ? "grab" : "crosshair";
  return null;
}
