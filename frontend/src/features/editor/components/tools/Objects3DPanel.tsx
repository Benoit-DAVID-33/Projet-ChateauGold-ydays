import clsx from "clsx";
import { Box, Circle, Hexagon } from "lucide-react";
import type { CSSProperties } from "react";

import { SHAPE3D_LABELS, type Shape3DKind } from "../../model/types";
import { useEditorStore } from "../../store/editorStore";
import { ColorPalette } from "./ColorPalette";
import styles from "./Tools.module.css";
import type { ToolPanelProps } from "./variant";

const OBJECTS: { kind: Shape3DKind; icon: typeof Box }[] = [
  { kind: "cube", icon: Box },
  { kind: "sphere", icon: Circle },
  { kind: "hexagon3d", icon: Hexagon },
];

/** Aide d'origine : rotation par Maj ou Alt + glisser, ou via le menu contextuel. */
function RotationHelp() {
  return (
    <p className={styles.help}>
      Maintenez <kbd>Maj</kbd> ou <kbd>Alt</kbd> + glisser pour faire tourner l'objet. Ou clic droit
      puis « Faire tourner », puis glisser.
    </p>
  );
}

/** « Objets 3D » : cube, bille, hexagone 3D. */
export function Objects3DPanel({ onDone, variant = "drawer" }: ToolPanelProps) {
  const color = useEditorStore((s) => s.color);
  const addShape3D = useEditorStore((s) => s.addShape3D);
  const kind = useEditorStore((s) => s.mediaInfo?.kind ?? s.mediaKind);
  const dense = variant === "sidebar";
  const preview = { "--preview-color": color } as CSSProperties;
  return (
    <>
      {!dense && (
        <p className={styles.intro}>
          Choisissez un objet 3D à placer sur {kind === "image" ? "l'image" : "la vidéo"}.
        </p>
      )}
      {!dense && <ColorPalette compact />}
      <div className={clsx(styles.grid, dense && styles.gridDense3)}>
        {OBJECTS.map(({ kind: shape, icon: Icon }) => (
          <button
            key={shape}
            type="button"
            className={clsx(styles.choice, dense && styles.choiceDense)}
            title={SHAPE3D_LABELS[shape]}
            onClick={() => {
              if (addShape3D(shape)) onDone?.();
            }}
          >
            <Icon className={styles.objectIcon} style={preview} aria-hidden />
            <span className={styles.choiceLabel}>{SHAPE3D_LABELS[shape]}</span>
          </button>
        ))}
      </div>
      <RotationHelp />
    </>
  );
}
