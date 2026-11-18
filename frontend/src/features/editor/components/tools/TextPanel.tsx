import { Check } from "lucide-react";
import { useId } from "react";

import { Button } from "@/shared/ui/Button";

import { FONT_SIZE } from "../../model/constants";
import { useEditorStore } from "../../store/editorStore";
import { ColorPalette } from "./ColorPalette";
import styles from "./Tools.module.css";
import type { ToolPanelProps } from "./variant";

/**
 * « Ajouter du texte » : présent mais inaccessible dans l'original, désormais
 * exposé. Après activation, chaque clic sur le média pose le texte.
 */
export function TextPanel({ onDone, variant = "drawer" }: ToolPanelProps) {
  const textId = useId();
  const sizeId = useId();
  const text = useEditorStore((s) => s.textDraft);
  const fontSize = useEditorStore((s) => s.fontSize);
  const textModeActive = useEditorStore((s) => s.tool.kind === "text");
  const kind = useEditorStore((s) => s.mediaInfo?.kind ?? s.mediaKind);
  const setText = useEditorStore((s) => s.setTextDraft);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const activate = useEditorStore((s) => s.activateTextMode);
  const dense = variant === "sidebar";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (activate()) onDone?.();
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={textId}>
          Texte :
        </label>
        <input
          id={textId}
          className={styles.input}
          type="text"
          value={text}
          placeholder="Entrez votre texte"
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={sizeId}>
          Taille :
        </label>
        <div className={styles.range}>
          <input
            id={sizeId}
            type="range"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <span className={styles.rangeValue} aria-hidden>
            {fontSize}px
          </span>
        </div>
      </div>
      {!dense && <ColorPalette compact />}
      <Button
        type="submit"
        variant="tools"
        size={dense ? "sm" : "md"}
        icon={<Check aria-hidden />}
        aria-pressed={textModeActive}
        className={textModeActive ? styles.active : undefined}
        block
      >
        Activer le mode texte
      </Button>
      <p className={styles.help}>
        Cliquez sur {kind === "video" ? "la vidéo" : "l'image"} pour placer le texte
      </p>
    </form>
  );
}
