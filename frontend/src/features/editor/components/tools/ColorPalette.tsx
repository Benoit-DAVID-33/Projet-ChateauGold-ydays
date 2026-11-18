import clsx from "clsx";
import type { CSSProperties } from "react";

import { PALETTE } from "../../model/types";
import { useEditorStore } from "../../store/editorStore";
import styles from "./Tools.module.css";

const swatchStyle = (color: string) => ({ "--swatch": color }) as CSSProperties;

interface ColorPaletteProps {
  /** Grille de 10 colonnes (tiroirs secondaires, colonne d'outils). */
  compact?: boolean;
  /** Bandeau de la couleur choisie (par défaut : affiché hors mode compact). */
  showPreview?: boolean;
}

/**
 * Palette d'origine (19 teintes). La couleur choisie s'applique à tout nouvel
 * élément (formes, 3D, lignes, texte, dessin) : l'original la limitait au dessin.
 */
export function ColorPalette({ compact = false, showPreview = !compact }: ColorPaletteProps) {
  const color = useEditorStore((s) => s.color);
  const setColor = useEditorStore((s) => s.setColor);
  return (
    <div className={styles.field}>
      <span className={styles.label}>Couleur :</span>
      <div
        className={clsx(styles.palette, compact && styles.compact)}
        role="group"
        aria-label="Couleur"
      >
        {PALETTE.map((hex) => {
          const selected = hex.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              className={clsx(styles.swatch, selected && styles.swatchSelected)}
              style={swatchStyle(hex)}
              onClick={() => setColor(hex)}
              aria-pressed={selected}
              aria-label={hex}
              title={hex}
              data-color={hex}
            />
          );
        })}
      </div>
      {showPreview && (
        <div
          className={clsx(styles.colorPreview, compact && styles.colorPreviewCompact)}
          style={swatchStyle(color)}
          aria-label={`Couleur sélectionnée : ${color}`}
          role="img"
        />
      )}
    </div>
  );
}
