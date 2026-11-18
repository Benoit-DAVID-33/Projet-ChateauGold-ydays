import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PALETTE } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { ToolsMenu } from "./ToolsMenu";

const store = () => useEditorStore.getState();

function renderMenu() {
  const onOpenChange = vi.fn();
  const utils = render(<ToolsMenu open onOpenChange={onOpenChange} />);
  return { ...utils, onOpenChange };
}

const open = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const title = () => screen.getByRole("heading", { level: 2 }).textContent;

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  store().reset("video");
  store().setMediaInfo({ kind: "video", name: "clip.mp4", width: 1280, height: 720 });
  store().setPlacementProvider(() => ({ center: { x: 640, y: 360 }, unitsPerPx: 1 }));
});

describe("ToolsMenu", () => {
  it("menu principal « Outils d'édition » avec Formes, Lignes, Texte, Dessin, Objets 3D", () => {
    renderMenu();
    expect(title()).toBe("Outils d'édition");
    for (const name of ["Formes", "Lignes", "Texte", "Dessin", "Objets 3D"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Retour" })).not.toBeInTheDocument();
  });

  it("Texte est accessible : saisie, taille, activation puis fermeture du menu", () => {
    const { onOpenChange } = renderMenu();
    open("Texte");
    expect(title()).toBe("Ajouter du texte");
    expect(screen.getByText("24px")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Taille :"), { target: { value: "40" } });
    fireEvent.change(screen.getByPlaceholderText("Entrez votre texte"), {
      target: { value: "Bonjour" },
    });
    open("Activer le mode texte");
    expect(store().tool).toEqual({ kind: "text", text: "Bonjour", fontSize: 40 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Texte vide : le menu reste ouvert avec le message d'origine", () => {
    const { onOpenChange } = renderMenu();
    open("Texte");
    open("Activer le mode texte");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(store().notice?.text).toBe("Veuillez entrer un texte");
  });

  it("Crayon est accessible depuis Dessin et ferme le menu", () => {
    const { onOpenChange } = renderMenu();
    open("Dessin");
    expect(title()).toBe("Palette de couleurs");
    open("Crayon");
    expect(store().tool).toEqual({ kind: "stroke", tool: "pencil" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Dessin : palette de 19 couleurs, épaisseur, feutre, gomme, désactiver", () => {
    const { onOpenChange } = renderMenu();
    open("Dessin");
    const swatches = PALETTE.map((hex) => screen.getByRole("button", { name: hex }));
    expect(swatches).toHaveLength(19);
    fireEvent.click(screen.getByRole("button", { name: "#FF0000" }));
    expect(store().color).toBe("#FF0000");
    fireEvent.change(screen.getByLabelText("Épaisseur :"), { target: { value: "12" } });
    expect(store().brushSize).toBe(12);
    expect(screen.getByText("12px")).toBeInTheDocument();
    open("Gomme");
    expect(store().tool).toEqual({ kind: "stroke", tool: "eraser" });
    onOpenChange.mockClear();
    open("Désactiver");
    expect(store().tool.kind).toBe("none");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Formes : ajoute la forme à la couleur choisie puis ferme le menu", () => {
    const { onOpenChange } = renderMenu();
    open("Formes");
    expect(title()).toBe("Formes disponibles");
    fireEvent.click(screen.getByRole("button", { name: "#0000FF" }));
    open("Carré arrondi");
    expect(store().elements[0]).toMatchObject({ shape: "rounded-square", color: "#0000FF" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Formes : le menu reste ouvert si le média n'est pas prêt", () => {
    store().reset("video");
    const { onOpenChange } = renderMenu();
    open("Formes");
    open("Carré");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(store().notice?.text).toBe("Veuillez attendre que la vidéo soit chargée.");
  });

  it("Lignes et Objets 3D", () => {
    renderMenu();
    open("Lignes");
    expect(title()).toBe("Types de lignes");
    open("Ligne torsadée");
    open("Retour");
    open("Objets 3D");
    open("Hexagone 3D");
    expect(store().elements.map((e) => e.type)).toEqual(["line", "shape3d"]);
  });

  it("« Retour » revient au menu principal ; chaque ouverture repart de l'accueil", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<ToolsMenu open onOpenChange={onOpenChange} />);
    open("Objets 3D");
    expect(screen.getByText(/Maintenez/)).toBeInTheDocument();
    open("Retour");
    expect(title()).toBe("Outils d'édition");
    open("Lignes");
    rerender(<ToolsMenu open={false} onOpenChange={onOpenChange} />);
    rerender(<ToolsMenu open onOpenChange={onOpenChange} />);
    expect(title()).toBe("Outils d'édition");
  });

  it("« Fermer » demande la fermeture", () => {
    const { onOpenChange } = renderMenu();
    open("Fermer");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
