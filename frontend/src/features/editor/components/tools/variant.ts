/**
 * Les sous-panneaux servent dans deux contextes :
 * - `drawer` : panneau latéral ToolsMenu (petits écrans), palette incluse ;
 * - `sidebar` : colonne permanente ToolsSidebar (~300 px), grilles denses,
 *   la palette ayant sa propre section « Couleur ».
 */
export type PanelVariant = "drawer" | "sidebar";

export interface ToolPanelProps {
  /** Appelé après un ajout ou l'activation d'un outil (le tiroir se ferme). */
  onDone?: () => void;
  variant?: PanelVariant;
}
