import clsx from "clsx";
import type { CSSProperties } from "react";

import { SHAPE_LABELS, type ShapeKind } from "../../model/types";
import { useEditorStore } from "../../store/editorStore";
import { ColorPalette } from "./ColorPalette";
import styles from "./Tools.module.css";
import type { ToolPanelProps } from "./variant";

const SHAPES = Object.keys(SHAPE_LABELS) as ShapeKind[];

/** « Formes disponibles » : 7 formes, placées au centre de la zone visible. */
export function ShapesPanel({ onDone, variant = "drawer" }: ToolPanelProps) {
  const color = useEditorStore((s) => s.color);
  const addShape = useEditorStore((s) => s.addShape);
  const dense = variant === "sidebar";
  const preview = { "--preview-color": color } as CSSProperties;
  return (
    <>
      {!dense && <ColorPalette compact />}
      <div className={clsx(styles.grid, dense && styles.gridDense)}>
        {SHAPES.map((kind) => (
          <button
            key={kind}
            type="button"
            className={clsx(styles.choice, dense && styles.choiceDense)}
            title={SHAPE_LABELS[kind]}
            onClick={() => {
              if (addShape(kind)) onDone?.();
            }}
          >
            <span className={clsx(styles.preview, styles[kind])} style={preview} aria-hidden />
            <span className={styles.choiceLabel}>{SHAPE_LABELS[kind]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
