import { EllipsisVertical, Redo2, Undo2 } from "lucide-react";
import type { MouseEvent } from "react";

import { useEditorStore } from "../store/editorStore";
import { selectCanRedo, selectCanUndo, selectSelectedElement } from "../store/selectors";
import styles from "./Controls.module.css";

interface EditActionsProps {
  /** Ouvre le menu contextuel de l'élément sélectionné (accès clavier / tactile). */
  onOpenActions: (anchor: { x: number; y: number }) => void;
}

/** Annuler / Rétablir et menu « Actions de l'élément » (nouveautés accessibles). */
export function EditActions({ onOpenActions }: EditActionsProps) {
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const hasSelection = useEditorStore((s) => selectSelectedElement(s) !== null);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const openActions = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onOpenActions({ x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <div className={styles.group} role="group" aria-label="Édition">
      <button
        type="button"
        className={styles.btn}
        onClick={undo}
        disabled={!canUndo}
        title="Annuler (Ctrl+Z)"
        aria-label="Annuler"
      >
        <Undo2 aria-hidden />
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={redo}
        disabled={!canRedo}
        title="Rétablir (Ctrl+Maj+Z)"
        aria-label="Rétablir"
      >
        <Redo2 aria-hidden />
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={openActions}
        disabled={!hasSelection}
        title="Actions de l'élément (Maj+F10)"
        aria-label="Actions de l'élément"
        aria-haspopup="menu"
      >
        <EllipsisVertical aria-hidden />
      </button>
    </div>
  );
}
