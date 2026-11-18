import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

import { LINE_LABELS, type LineKind } from "../../model/types";
import { useEditorStore } from "../../store/editorStore";
import { ColorPalette } from "./ColorPalette";
import styles from "./Tools.module.css";
import type { ToolPanelProps } from "./variant";

/** Aperçus SVG 50 par 50 d'origine. */
const PREVIEWS: Record<LineKind, ReactNode> = {
  "straight-arrow": (
    <>
      <line x1="8" y1="25" x2="36" y2="25" />
      <polygon points="44,25 34,19 34,31" fill="currentColor" />
    </>
  ),
  curved: <path d="M8 38 Q25 2 42 38" fill="none" />,
  zigzag: <polyline points="6,25 13,15 20,35 27,15 34,35 44,25" fill="none" />,
};

/** Titre d'infobulle d'origine (« Zigzag » pour la ligne torsadée). */
const TITLES: Record<LineKind, string> = {
  "straight-arrow": LINE_LABELS["straight-arrow"],
  curved: LINE_LABELS.curved,
  zigzag: "Zigzag",
};

const LINES = Object.keys(LINE_LABELS) as LineKind[];

/** « Types de lignes » : ligne horizontale de 160 px centrée, extrémités déplaçables. */
export function LinesPanel({ onDone, variant = "drawer" }: ToolPanelProps) {
  const color = useEditorStore((s) => s.color);
  const addLine = useEditorStore((s) => s.addLine);
  const dense = variant === "sidebar";
  const preview = { "--preview-color": color } as CSSProperties;
  return (
    <>
      {!dense && <ColorPalette compact />}
      <div className={clsx(styles.grid, dense && styles.gridDense3)}>
        {LINES.map((kind) => (
          <button
            key={kind}
            type="button"
            className={clsx(styles.choice, dense && styles.choiceDense)}
            title={TITLES[kind]}
            onClick={() => {
              if (addLine(kind)) onDone?.();
            }}
          >
            <svg
              className={styles.linePreview}
              style={preview}
              viewBox="0 0 50 50"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {PREVIEWS[kind]}
            </svg>
            <span className={styles.choiceLabel}>{LINE_LABELS[kind]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
