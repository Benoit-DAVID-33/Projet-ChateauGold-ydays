import clsx from "clsx";
import { Eraser, Hand, PenLine, Pencil } from "lucide-react";
import { useId } from "react";

import { Button, type ButtonVariant } from "@/shared/ui/Button";

import { BRUSH_SIZE } from "../../model/constants";
import { STROKE_LABELS } from "../../model/labels";
import type { StrokeTool } from "../../model/types";
import { useEditorStore } from "../../store/editorStore";
import { ColorPalette } from "./ColorPalette";
import styles from "./Tools.module.css";
import type { ToolPanelProps } from "./variant";

const STROKE_TOOLS: { tool: StrokeTool; icon: typeof Pencil; look: ButtonVariant }[] = [
  { tool: "pencil", icon: Pencil, look: "tools" },
  { tool: "marker", icon: PenLine, look: "tools" },
  { tool: "eraser", icon: Eraser, look: "danger" },
];

/**
 * « Palette de couleurs » : couleur, épaisseur (effet immédiat, y compris sur
 * l'outil actif), Crayon (inaccessible dans l'original), Feutre, Gomme, Désactiver.
 * En colonne (`sidebar`), la palette est dans la section « Couleur ».
 */
export function DrawPanel({ onDone, variant = "drawer" }: ToolPanelProps) {
  const sizeId = useId();
  const brushSize = useEditorStore((s) => s.brushSize);
  const tool = useEditorStore((s) => s.tool);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const activateStrokeTool = useEditorStore((s) => s.activateStrokeTool);
  const deactivateTools = useEditorStore((s) => s.deactivateTools);
  const activeStroke = tool.kind === "stroke" ? tool.tool : null;
  const dense = variant === "sidebar";
  const size = dense ? "sm" : "md";

  return (
    <>
      {!dense && <ColorPalette />}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={sizeId}>
          Épaisseur :
        </label>
        <div className={styles.range}>
          <input
            id={sizeId}
            type="range"
            min={BRUSH_SIZE.min}
            max={BRUSH_SIZE.max}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className={styles.rangeValue} aria-hidden>
            {brushSize}px
          </span>
        </div>
      </div>
      <div className={clsx(styles.actions, dense && styles.actionsDense)}>
        {STROKE_TOOLS.map(({ tool: stroke, icon: Icon, look }) => (
          <Button
            key={stroke}
            variant={look}
            size={size}
            icon={<Icon aria-hidden />}
            aria-pressed={activeStroke === stroke}
            className={clsx(activeStroke === stroke && styles.active)}
            onClick={() => {
              activateStrokeTool(stroke);
              onDone?.();
            }}
          >
            {STROKE_LABELS[stroke]}
          </Button>
        ))}
        <Button variant="dark" size={size} icon={<Hand aria-hidden />} onClick={deactivateTools}>
          Désactiver
        </Button>
      </div>
    </>
  );
}
