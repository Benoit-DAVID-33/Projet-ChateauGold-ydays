import { X } from "lucide-react";

import { STROKE_LABELS } from "../model/labels";
import { useEditorStore, type ActiveTool } from "../store/editorStore";
import styles from "./Controls.module.css";

function toolLabel(tool: ActiveTool, rotateArmed: boolean): string | null {
  if (rotateArmed) return "Faire tourner : glissez sur l'objet 3D";
  if (tool.kind === "text") return `Mode texte : « ${tool.text} » — cliquez pour placer`;
  if (tool.kind === "stroke") return `${STROKE_LABELS[tool.tool]} actif`;
  return null;
}

interface ToolStatusProps {
  /** Texte affiché sans outil actif (rien par défaut). */
  idleLabel?: string;
  /** Nom accessible du bouton de sortie (distinct si plusieurs statuts à l'écran). */
  exitLabel?: string;
}

/** Indique l'outil actif et permet d'en sortir (équivaut à Échap, utile au tactile). */
export function ToolStatus({ idleLabel, exitLabel = "Quitter" }: ToolStatusProps) {
  const tool = useEditorStore((s) => s.tool);
  const rotateArmed = useEditorStore((s) => s.rotateArmed);
  const deactivate = useEditorStore((s) => s.deactivateTools);
  const label = toolLabel(tool, rotateArmed);
  if (!label) return idleLabel ? <p className={styles.toolIdle}>{idleLabel}</p> : null;
  return (
    <div className={styles.tool} role="status">
      <span className={styles.toolLabel}>{label}</span>
      <button
        type="button"
        className={styles.toolExit}
        onClick={deactivate}
        title="Échap"
        aria-label={exitLabel}
      >
        <X aria-hidden />
        Quitter
      </button>
    </div>
  );
}
