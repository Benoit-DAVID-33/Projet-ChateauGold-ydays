import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useEditorStore } from "../store/editorStore";
import { ToolsSidebar } from "./ToolsSidebar";

const store = () => useEditorStore.getState();
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  store().reset("video");
  store().setMediaInfo({ kind: "video", name: "clip.mp4", width: 1280, height: 720, duration: 8 });
  store().setPlacementProvider(() => ({ center: { x: 640, y: 360 }, unitsPerPx: 1 }));
});

describe("ToolsSidebar", () => {
  it("affiche toutes les sections en permanence, sans fenêtre modale", () => {
    render(<ToolsSidebar className="col" />);
    const aside = screen.getByRole("complementary", { name: "Outils d'édition" });
    expect(aside).toHaveClass("col");
    for (const title of ["Couleur", "Formes", "Lignes", "Texte", "Dessin", "Objets 3D"]) {
      expect(within(aside).getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Aucun outil actif/)).toBeInTheDocument();
  });

  it("ajoute formes, lignes et objets 3D à la couleur choisie (la colonne reste en place)", () => {
    render(<ToolsSidebar />);
    click("#FF0000");
    click("Losange");
    click("Courbe");
    click("Bille");
    expect(store().elements.map((e) => [e.type, e.color])).toEqual([
      ["shape", "#FF0000"],
      ["line", "#FF0000"],
      ["shape3d", "#FF0000"],
    ]);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("une seule palette dans la colonne (section Couleur)", () => {
    render(<ToolsSidebar />);
    expect(screen.getAllByRole("group", { name: "Couleur" })).toHaveLength(1);
  });

  it("outil actif mis en évidence : statut, bouton pressé, pastille « Actif »", () => {
    render(<ToolsSidebar />);
    click("Feutre");
    expect(store().tool).toEqual({ kind: "stroke", tool: "marker" });
    expect(screen.getByRole("button", { name: "Feutre" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Feutre actif")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
    click("Quitter l'outil");
    expect(store().tool.kind).toBe("none");
    expect(screen.queryByText("Actif")).not.toBeInTheDocument();
  });

  it("Texte et épaisseur depuis la colonne", () => {
    render(<ToolsSidebar />);
    fireEvent.change(screen.getByPlaceholderText("Entrez votre texte"), {
      target: { value: "Titre" },
    });
    click("Activer le mode texte");
    expect(store().tool).toMatchObject({ kind: "text", text: "Titre" });
    expect(screen.getByRole("button", { name: "Activer le mode texte" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Épaisseur :"), { target: { value: "9" } });
    expect(store().brushSize).toBe(9);
  });
});
