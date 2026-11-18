/**
 * Molette :
 * - Ctrl/Cmd + molette sur la zone média : zoom (comme zoom.js) ;
 * - molette seule : redimensionne l'élément sélectionné (×1,1 / ×0,9 autour
 *   du centre) UNIQUEMENT si un élément est sélectionné et que le pointeur est
 *   sur le média — sinon la page défile normalement.
 * Écouteur natif non passif (React attache `wheel` en passif).
 */
import { useEffect, type RefObject } from "react";

import { WHEEL_FACTOR } from "../model/constants";
import type { TextMeasurer } from "../model/text";
import { scaleElement } from "../model/transform";
import { isVisibleAt, type Point } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { selectSelectedElement } from "../store/selectors";
import { unitsPerPx, type ViewMetrics } from "./coords";
import { sizeLimits } from "./gestures";

/** Délais anti-rafale (pavés tactiles : dizaines d'événements par seconde). */
const ZOOM_INTERVAL_MS = 80;
const SCALE_INTERVAL_MS = 40;
/** Fin d'une série de crans de molette = une seule entrée d'historique. */
const WHEEL_IDLE_MS = 350;

export interface WheelOptions {
  viewportRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  getMetrics: () => ViewMetrics | null;
  measure: TextMeasurer;
  /** +1 / −1 cran de zoom, ancré sur la position écran du pointeur. */
  onZoomStep: (direction: 1 | -1, anchor: Point) => void;
}

export function useWheelControls({
  viewportRef,
  stageRef,
  getMetrics,
  measure,
  onZoomStep,
}: WheelOptions): void {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let lastZoom = -Infinity;
    let lastScale = -Infinity;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let ownsGesture = false;

    const endWheelGesture = () => {
      if (ownsGesture) useEditorStore.getState().endGesture();
      ownsGesture = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.timeStamp - lastZoom < ZOOM_INTERVAL_MS || e.deltaY === 0) return;
        lastZoom = e.timeStamp;
        onZoomStep(e.deltaY > 0 ? -1 : 1, { x: e.clientX, y: e.clientY });
        return;
      }
      const stage = stageRef.current;
      if (!stage || !(e.target instanceof Node) || !stage.contains(e.target)) return;
      const store = useEditorStore.getState();
      const selected = selectSelectedElement(store);
      const metrics = getMetrics();
      if (!selected || !metrics || e.deltaY === 0 || !isVisibleAt(selected, store.currentTime)) {
        return;
      }
      e.preventDefault();
      if (e.timeStamp - lastScale < SCALE_INTERVAL_MS) return;
      lastScale = e.timeStamp;
      if (!ownsGesture && store.gestureBase === null) {
        store.beginGesture();
        ownsGesture = true;
      }
      const factor = e.deltaY > 0 ? WHEEL_FACTOR.shrink : WHEEL_FACTOR.grow;
      const limits = sizeLimits(unitsPerPx(metrics), measure);
      store.updateElement(selected.id, (el) => scaleElement(el, factor, limits));
      clearTimeout(idleTimer);
      idleTimer = setTimeout(endWheelGesture, WHEEL_IDLE_MS);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      clearTimeout(idleTimer);
      endWheelGesture();
    };
  }, [viewportRef, stageRef, getMetrics, measure, onZoomStep]);
}
