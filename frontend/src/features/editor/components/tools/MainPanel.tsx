import { Box, Brush, ChevronRight, Minus, Shapes, Type } from "lucide-react";

import styles from "./Tools.module.css";

export type SubPanel = "shapes" | "lines" | "text" | "draw" | "objects3d";

const ENTRIES: { panel: SubPanel; label: string; icon: typeof Shapes }[] = [
  { panel: "shapes", label: "Formes", icon: Shapes },
  { panel: "lines", label: "Lignes", icon: Minus },
  { panel: "text", label: "Texte", icon: Type },
  { panel: "draw", label: "Dessin", icon: Brush },
  { panel: "objects3d", label: "Objets 3D", icon: Box },
];

/** Menu principal « Outils d'édition » (Texte ajouté : inaccessible dans l'original). */
export function MainPanel({ onOpen }: { onOpen: (panel: SubPanel) => void }) {
  return (
    <div className={styles.list}>
      {ENTRIES.map(({ panel, label, icon: Icon }) => (
        <button key={panel} type="button" className={styles.entry} onClick={() => onOpen(panel)}>
          <Icon aria-hidden />
          {label}
          <ChevronRight className={styles.chevron} aria-hidden />
        </button>
      ))}
    </div>
  );
}
