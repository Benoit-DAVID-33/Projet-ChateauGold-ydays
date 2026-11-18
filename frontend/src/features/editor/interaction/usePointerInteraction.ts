/**
 * Relie les Pointer Events (souris, tactile, stylet) aux gestes de l'éditeur.
 *
 * Les écouteurs sont posés sur la « scène » (parent du média et du calque) :
 * ils reçoivent les événements que le calque soit actif ou non (bulle depuis
 * <video>/<img>). Un geste capturé utilise `setPointerCapture` sur la scène,
 * ce qui remplace les écouteurs `document` et les `mouseleave` d'origine.
 * Voir README « Stratégie pointer-events ».
 */
import { useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";

import { UI_PX } from "../model/constants";
import { distance } from "../model/geometry";
import { findElementAt } from "../model/hitTest";
import type { TextMeasurer } from "../model/text";
import type { Point } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { clientToNative, unitsPerPx, type ViewMetrics } from "./coords";
import {
  applyGesture,
  decidePointerDown,
  hitOptions,
  hoverAt,
  NO_HOVER,
  type Gesture,
  type HoverInfo,
  type PointerSample,
} from "./gestures";

interface ActiveGesture {
  pointerId: number;
  gesture: Gesture;
}

export interface PointerInteractionOptions {
  /** Élément à focaliser au début d'un geste (raccourcis clavier). */
  focusRef: RefObject<HTMLElement | null>;
  getMetrics: () => ViewMetrics | null;
  measure: TextMeasurer;
  onContextMenu: (position: Point) => void;
  onBackgroundDoubleClick: () => void;
}

const sampleOf = (
  metrics: ViewMetrics,
  e: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean },
): PointerSample => ({
  point: clientToNative(metrics, e.clientX, e.clientY),
  client: { x: e.clientX, y: e.clientY },
  shiftKey: e.shiftKey,
  altKey: e.altKey,
});

function capture(target: Element, pointerId: number): void {
  try {
    if (typeof target.setPointerCapture === "function") target.setPointerCapture(pointerId);
  } catch {
    // Pointeur déjà relâché (événement synthétique) : sans capture, le geste reste valide.
  }
}

export function usePointerInteraction(options: PointerInteractionOptions) {
  const { focusRef, getMetrics, measure, onContextMenu, onBackgroundDoubleClick } = options;
  const active = useRef<ActiveGesture | null>(null);
  const [hover, setHover] = useState<HoverInfo>(NO_HOVER);
  const [dragging, setDragging] = useState(false);

  const updateHover = (next: HoverInfo) =>
    setHover((prev) =>
      prev.cursor === next.cursor && prev.overElement === next.overElement ? prev : next,
    );

  const focusEditor = () => focusRef.current?.focus({ preventScroll: true });

  const finish = (pointerId: number) => {
    if (active.current?.pointerId !== pointerId) return;
    active.current = null;
    setDragging(false);
    useEditorStore.getState().endGesture();
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (active.current || !e.isPrimary || e.button !== 0) return;
    const metrics = getMetrics();
    if (!metrics) return;
    const store = useEditorStore.getState();
    const upp = unitsPerPx(metrics);
    const sample = sampleOf(metrics, e);
    const decision = decidePointerDown(store, sample, upp, measure);
    store.disarmRotation();

    if (decision.action === "pass-through") {
      store.select(null);
      return; // le lecteur vidéo / l'image reçoit l'événement normalement
    }
    e.preventDefault();
    focusEditor();
    if (decision.action === "place-text") {
      store.placeText(sample.point, upp);
      return;
    }

    store.beginGesture();
    let gesture: Gesture;
    if (decision.action === "draw") {
      const id = store.startStroke(sample.point, upp);
      if (!id) {
        store.endGesture();
        return;
      }
      gesture = { kind: "draw", id, last: sample.point };
    } else {
      gesture = decision.gesture;
      store.select(gesture.id);
    }
    active.current = { pointerId: e.pointerId, gesture };
    capture(e.currentTarget, e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const metrics = getMetrics();
    if (!metrics) return;
    const upp = unitsPerPx(metrics);
    const current = active.current;
    const store = useEditorStore.getState();

    if (!current) {
      // Survol (souris / stylet) : le calque ne capte que s'il y a un élément dessous.
      if (e.pointerType !== "touch") {
        updateHover(hoverAt(store, clientToNative(metrics, e.clientX, e.clientY), upp, measure));
      }
      return;
    }
    if (current.pointerId !== e.pointerId) return;
    const { gesture } = current;

    if (gesture.kind === "draw") {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const events = coalesced.length > 0 ? coalesced : [e.nativeEvent];
      const points: Point[] = [];
      let last = gesture.last;
      for (const ev of events) {
        const p = clientToNative(metrics, ev.clientX, ev.clientY);
        if (distance(p, last) >= UI_PX.strokeStep * upp) {
          points.push(p);
          last = p;
        }
      }
      if (points.length > 0) {
        store.extendStroke(gesture.id, points);
        active.current = { ...current, gesture: { ...gesture, last } };
      }
      return;
    }
    const sample = sampleOf(metrics, e);
    store.updateElement(gesture.id, () => applyGesture(gesture, sample, upp, measure));
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => finish(e.pointerId);

  const onPointerLeave = () => {
    if (!active.current) updateHover(NO_HOVER);
  };

  /** Clic droit / appui long sur un élément : menu contextuel ; ailleurs, menu natif. */
  const onContextMenuEvent = (e: MouseEvent<HTMLElement>) => {
    const metrics = getMetrics();
    if (!metrics) return;
    // Ctrl+clic (macOS) et appui long (tactile) commencent par un pointerdown principal.
    if (active.current) finish(active.current.pointerId);
    const store = useEditorStore.getState();
    const point = clientToNative(metrics, e.clientX, e.clientY);
    const hit = findElementAt(
      store.elements,
      point,
      store.currentTime,
      hitOptions(unitsPerPx(metrics), measure),
    );
    if (!hit) return;
    e.preventDefault();
    store.select(hit.id);
    onContextMenu({ x: e.clientX, y: e.clientY });
  };

  const onDoubleClick = (e: MouseEvent<HTMLElement>) => {
    const metrics = getMetrics();
    if (!metrics) return;
    const store = useEditorStore.getState();
    if (store.tool.kind !== "none") return;
    const point = clientToNative(metrics, e.clientX, e.clientY);
    const opts = hitOptions(unitsPerPx(metrics), measure);
    if (!findElementAt(store.elements, point, store.currentTime, opts)) onBackgroundDoubleClick();
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
      onPointerLeave,
      onContextMenu: onContextMenuEvent,
      onDoubleClick,
    },
    hoverCursor: hover.cursor,
    /** Le calque doit-il capter le pointeur (survol d'un élément ou geste en cours) ? */
    capturing: hover.overElement || dragging,
    dragging,
  };
}
