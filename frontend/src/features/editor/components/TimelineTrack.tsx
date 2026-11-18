import clsx from "clsx";
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { elementLabel, formatSeconds, timeWindowLabel } from "../model/labels";
import { retimeEdge, shiftWindow, timeAtClientX, type TimeWindow } from "../model/timing";
import type { AnnotationElement } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import styles from "./TimelinePanel.module.css";

type DragKind = "start" | "end" | "move";

interface Drag {
  kind: DragKind;
  pointerId: number;
  /** Temps sous le pointeur au début du glisser. */
  origin: number;
  base: TimeWindow;
  rect: DOMRect;
}

interface TimelineTrackProps {
  element: AnnotationElement;
  duration: number;
  selected: boolean;
}

const round1 = (t: number) => Math.round(t * 10) / 10;

/**
 * Une piste : barre [startTime, endTime) de l'élément. Glisser les bords
 * modifie le début ou la fin, glisser la barre la décale ; un glisser = une
 * entrée d'historique. Bords accessibles au clavier (curseurs ARIA).
 */
export function TimelineTrack({ element, duration, selected }: TimelineTrackProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const label = elementLabel(element);
  const end = element.endTime ?? duration;
  const left = (element.startTime / duration) * 100;
  const width = Math.max(0, ((end - element.startTime) / duration) * 100);

  /** Un seul gestionnaire : le bord saisi est lu sur `data-edge` (sinon, la barre entière). */
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const edge = e.target instanceof HTMLElement ? e.target.dataset.edge : undefined;
    const kind: DragKind = edge === "start" || edge === "end" ? edge : "move";
    const target = e.target instanceof Element ? e.target : e.currentTarget;
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const store = useEditorStore.getState();
    if (kind === "move") store.focusElement(element.id);
    else store.select(element.id);
    store.beginGesture();
    drag.current = {
      kind,
      pointerId: e.pointerId,
      origin: timeAtClientX(e.clientX, rect, duration),
      base: { startTime: element.startTime, endTime: element.endTime },
      rect,
    };
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      // pointeur déjà relâché
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const t = timeAtClientX(e.clientX, d.rect, duration);
    const next =
      d.kind === "move"
        ? shiftWindow(d.base, t - d.origin, duration)
        : retimeEdge(d.base, d.kind, t, duration);
    useEditorStore.getState().setElementTiming(element.id, next);
  };

  const onEnd = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    useEditorStore.getState().endGesture();
  };

  const onEdgeKey = (edge: "start" | "end") => (e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 1 : 0.1;
    const current = edge === "start" ? element.startTime : end;
    const targets: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowDown: current - step,
      ArrowRight: current + step,
      ArrowUp: current + step,
      Home: 0,
      End: duration,
    };
    const target = targets[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const store = useEditorStore.getState();
    store.select(element.id);
    store.setElementTiming(element.id, retimeEdge(element, edge, target, duration));
  };

  const barStyle = {
    left: `${left}%`,
    width: `${width}%`,
    "--bar-color": element.color,
  } as CSSProperties;

  return (
    <div className={styles.row}>
      <span className={styles.rowLabel} title={label}>
        <span
          className={styles.swatch}
          style={{ "--swatch": element.color } as CSSProperties}
          aria-hidden
        />
        <span className={styles.rowName}>{label}</span>
      </span>
      <div ref={areaRef} className={styles.area}>
        <div
          className={clsx(styles.bar, selected && styles.barSelected)}
          style={barStyle}
          title={`${label} : ${timeWindowLabel(element)}`}
          data-testid={`timeline-bar-${element.id}`}
          onPointerDown={onPointerDown}
          onPointerMove={onMove}
          onPointerUp={onEnd}
          onPointerCancel={onEnd}
          onLostPointerCapture={onEnd}
        >
          <span
            role="slider"
            tabIndex={0}
            className={clsx(styles.edge, styles.edgeStart)}
            aria-label={`Début : ${label}`}
            aria-valuemin={0}
            aria-valuemax={round1(duration)}
            aria-valuenow={round1(element.startTime)}
            aria-valuetext={formatSeconds(element.startTime)}
            data-edge="start"
            onKeyDown={onEdgeKey("start")}
          />
          <span
            role="slider"
            tabIndex={0}
            className={clsx(styles.edge, styles.edgeEnd)}
            aria-label={`Fin : ${label}`}
            aria-valuemin={0}
            aria-valuemax={round1(duration)}
            aria-valuenow={round1(end)}
            aria-valuetext={element.endTime === null ? "jusqu'à la fin" : formatSeconds(end)}
            data-edge="end"
            onKeyDown={onEdgeKey("end")}
          />
        </div>
      </div>
    </div>
  );
}
