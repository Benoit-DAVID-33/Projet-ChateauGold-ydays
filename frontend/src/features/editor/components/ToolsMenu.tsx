import { useCallback, useEffect, useRef, useState } from "react";

import { SidePanel } from "@/shared/ui/SidePanel";

import { DrawPanel } from "./tools/DrawPanel";
import { LinesPanel } from "./tools/LinesPanel";
import { MainPanel, type SubPanel } from "./tools/MainPanel";
import { Objects3DPanel } from "./tools/Objects3DPanel";
import { ShapesPanel } from "./tools/ShapesPanel";
import { TextPanel } from "./tools/TextPanel";

export interface ToolsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Panel = "main" | SubPanel;

const TITLES: Record<Panel, string> = {
  main: "Outils d'édition",
  shapes: "Formes disponibles",
  lines: "Types de lignes",
  text: "Ajouter du texte",
  draw: "Palette de couleurs",
  objects3d: "Objets 3D",
};

/**
 * Panneau gauche « Outils d'édition » et ses sous-menus (bouton « Retour »).
 * Après un ajout ou l'activation d'un outil, le panneau se FERME pour rendre
 * le média utilisable (l'original laissait un voile bloquant le canvas).
 */
export function ToolsMenu({ open, onOpenChange }: ToolsMenuProps) {
  const [panel, setPanel] = useState<Panel>("main");
  const [wasOpen, setWasOpen] = useState(open);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Chaque ouverture repart du menu principal.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPanel("main");
  }

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Focus sur le premier contrôle du panneau affiché (navigation clavier).
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
  }, [open, panel]);

  const content = (() => {
    switch (panel) {
      case "main":
        return <MainPanel onOpen={setPanel} />;
      case "shapes":
        return <ShapesPanel onDone={close} />;
      case "lines":
        return <LinesPanel onDone={close} />;
      case "text":
        return <TextPanel onDone={close} />;
      case "draw":
        return <DrawPanel onDone={close} />;
      case "objects3d":
        return <Objects3DPanel onDone={close} />;
    }
  })();

  return (
    <SidePanel
      open={open}
      onClose={close}
      title={TITLES[panel]}
      side="left"
      width={350}
      onBack={panel === "main" ? undefined : () => setPanel("main")}
    >
      <div ref={bodyRef}>{content}</div>
    </SidePanel>
  );
}
