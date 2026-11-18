import clsx from "clsx";
import { Box, Brush, ChevronDown, Minus, Palette, Shapes, Type } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useEditorStore } from "../store/editorStore";
import { ToolStatus } from "./ToolStatus";
import { ColorPalette } from "./tools/ColorPalette";
import { DrawPanel } from "./tools/DrawPanel";
import { LinesPanel } from "./tools/LinesPanel";
import { Objects3DPanel } from "./tools/Objects3DPanel";
import { ShapesPanel } from "./tools/ShapesPanel";
import { TextPanel } from "./tools/TextPanel";
import toolStyles from "./tools/Tools.module.css";
import styles from "./ToolsSidebar.module.css";

export interface ToolsSidebarProps {
  className?: string;
}

interface SectionProps {
  title: string;
  icon: typeof Box;
  defaultOpen?: boolean;
  /** Section de l'outil actif : liseré et pastille « Actif ». */
  active?: boolean;
  children: ReactNode;
}

function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  active = false,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={clsx(styles.section, active && styles.sectionActive)}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={styles.summary}>
        <Icon className={styles.summaryIcon} aria-hidden />
        <span className={styles.summaryTitle}>{title}</span>
        {active && <span className={styles.badge}>Actif</span>}
        <ChevronDown className={styles.chevron} aria-hidden />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

/**
 * Version permanente (non modale) des menus d'outils, pour une colonne d'environ
 * 300 px (mise en page type SD WebUI). Mêmes sous-panneaux et mêmes actions du
 * store que ToolsMenu ; rien ne se ferme après un ajout.
 */
export function ToolsSidebar({ className }: ToolsSidebarProps) {
  const toolKind = useEditorStore((s) => s.tool.kind);
  const rotateArmed = useEditorStore((s) => s.rotateArmed);
  return (
    <aside
      className={clsx(styles.sidebar, toolStyles.denseScope, className)}
      aria-label="Outils d'édition"
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Outils d'édition</h2>
        <ToolStatus
          idleLabel="Aucun outil actif : cliquez un élément pour le sélectionner."
          exitLabel="Quitter l'outil"
        />
      </header>
      <Section title="Couleur" icon={Palette} defaultOpen>
        <ColorPalette compact showPreview />
      </Section>
      <Section title="Formes" icon={Shapes} defaultOpen>
        <ShapesPanel variant="sidebar" />
      </Section>
      <Section title="Lignes" icon={Minus} defaultOpen>
        <LinesPanel variant="sidebar" />
      </Section>
      <Section title="Texte" icon={Type} active={toolKind === "text"}>
        <TextPanel variant="sidebar" />
      </Section>
      <Section title="Dessin" icon={Brush} defaultOpen active={toolKind === "stroke"}>
        <DrawPanel variant="sidebar" />
      </Section>
      <Section title="Objets 3D" icon={Box} active={rotateArmed}>
        <Objects3DPanel variant="sidebar" />
      </Section>
    </aside>
  );
}
