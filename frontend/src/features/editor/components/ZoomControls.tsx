import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

import { ZOOM } from "../model/constants";
import styles from "./Controls.module.css";

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Zoom 100 % (et, pour une vidéo, retour au début puis lecture, comme zoom.js). */
  onReset: () => void;
}

/** Contrôles de zoom d'origine : niveau en %, zoom avant, zoom arrière, réinitialiser. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  const percent = Math.round(zoom * 100);
  return (
    <div className={styles.group} role="group" aria-label="Zoom">
      <span className={styles.level} aria-live="polite" aria-label={`Zoom ${percent} %`}>
        {percent}%
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={onZoomIn}
        disabled={zoom >= ZOOM.max}
        title="Zoom avant"
        aria-label="Zoom avant"
      >
        <ZoomIn aria-hidden />
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={onZoomOut}
        disabled={zoom <= ZOOM.min}
        title="Zoom arrière"
        aria-label="Zoom arrière"
      >
        <ZoomOut aria-hidden />
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={onReset}
        title="Réinitialiser le zoom"
        aria-label="Réinitialiser le zoom"
      >
        <RotateCcw aria-hidden />
      </button>
    </div>
  );
}
