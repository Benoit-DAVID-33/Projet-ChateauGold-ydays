import clsx from "clsx";
import { useId, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { formatSeconds, formatTick } from "../model/labels";
import { rulerStep, timeAtClientX } from "../model/timing";
import { useEditorStore } from "../store/editorStore";
import styles from "./TimelinePanel.module.css";
import { TimelineTrack } from "./TimelineTrack";

export interface TimelinePanelProps {
  className?: string;
}

/** Curseur de lecture : seul composant re-rendu à chaque frame pendant la lecture. */
function TimeCursor({ duration, className }: { duration: number; className?: string }) {
  const percent = useEditorStore((s) => Math.min(100, (s.currentTime / duration) * 100));
  return (
    <div className={clsx(styles.cursorLayer, className)} aria-hidden>
      <div className={styles.cursor} style={{ left: `${percent}%` }} />
    </div>
  );
}

function TimeReadout({ duration }: { duration: number | null }) {
  const currentTime = useEditorStore((s) => s.currentTime);
  return (
    <span className={styles.readout}>
      {formatSeconds(currentTime)} / {duration === null ? "--" : formatSeconds(duration)}
    </span>
  );
}

/** Règle graduée : clic ou glisser pour déplacer la lecture ; curseur ARIA au clavier. */
function Ruler({ duration }: { duration: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrubbing = useRef<number | null>(null);
  const currentTime = useEditorStore((s) => s.currentTime);
  const requestSeek = useEditorStore((s) => s.requestSeek);
  const step = rulerStep(duration);
  const ticks = Array.from({ length: Math.floor(duration / step + 1e-9) + 1 }, (_, i) => i * step);

  const seekAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect && rect.width > 0) requestSeek(timeAtClientX(clientX, rect, duration));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    scrubbing.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // pointeur déjà relâché
    }
    seekAt(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current === e.pointerId) seekAt(e.clientX);
  };
  const stop = () => {
    scrubbing.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.shiftKey ? 1 : 0.1;
    const targets: Record<string, number> = {
      ArrowLeft: currentTime - delta,
      ArrowDown: currentTime - delta,
      ArrowRight: currentTime + delta,
      ArrowUp: currentTime + delta,
      Home: 0,
      End: duration,
    };
    const target = targets[e.key];
    if (target === undefined) return;
    e.preventDefault();
    requestSeek(target);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      className={styles.ruler}
      aria-label="Position de lecture"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      aria-valuenow={Math.round(currentTime * 10) / 10}
      aria-valuetext={formatSeconds(currentTime)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
    >
      {ticks.map((t) => (
        <span key={t} className={styles.tick} style={{ left: `${(t / duration) * 100}%` }}>
          <span className={styles.tickLabel}>{formatTick(t)}</span>
        </span>
      ))}
      <TimeCursor duration={duration} />
    </div>
  );
}

/**
 * Chronologie (vidéo uniquement, rien pour une image) : règle sur la durée avec
 * curseur de lecture, une barre [startTime, endTime) par élément (le premier est
 * au-dessus, comme les calques). Le seek passe par `requestSeek` du store,
 * appliqué au <video> par MediaEditor.
 */
export function TimelinePanel({ className }: TimelinePanelProps) {
  const titleId = useId();
  const kind = useEditorStore((s) => s.mediaInfo?.kind ?? s.mediaKind);
  const info = useEditorStore((s) => s.mediaInfo);
  const elements = useEditorStore((s) => s.elements);
  const selectedId = useEditorStore((s) => s.selectedId);
  if (kind !== "video") return null;

  const duration = info?.duration;
  const known = duration !== undefined && Number.isFinite(duration) && duration > 0;
  const tracks = [...elements].reverse();

  return (
    <section className={clsx(styles.panel, className)} aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Chronologie
        </h2>
        <TimeReadout duration={known ? duration : null} />
      </header>
      {!known ? (
        <p className={styles.empty}>
          {info
            ? "Durée de la vidéo inconnue : chronologie indisponible."
            : "Chargement de la vidéo…"}
        </p>
      ) : (
        <div className={styles.body}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Temps</span>
            <Ruler duration={duration} />
          </div>
          {tracks.length === 0 ? (
            <p className={styles.empty}>Aucun élément sur la vidéo.</p>
          ) : (
            <div className={styles.tracks}>
              {tracks.map((element) => (
                <TimelineTrack
                  key={element.id}
                  element={element}
                  duration={duration}
                  selected={element.id === selectedId}
                />
              ))}
              <TimeCursor duration={duration} className={styles.tracksCursor} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
