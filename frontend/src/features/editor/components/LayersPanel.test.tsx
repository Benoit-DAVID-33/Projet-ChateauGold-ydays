import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { MediaInfo } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { shape, text } from "../test-utils/fixtures";
import { LayersPanel } from "./LayersPanel";

const store = () => useEditorStore.getState();
const VIDEO: MediaInfo = { kind: "video", name: "clip.mp4", width: 800, height: 600, duration: 10 };
const IMAGE: MediaInfo = { kind: "image", name: "photo.png", width: 800, height: 600 };

function setup(info: MediaInfo) {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  store().reset(info.kind);
  store().setMediaInfo(info);
}

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("LayersPanel", () => {
  beforeEach(() => setup(VIDEO));

  it("liste vide", () => {
    render(<LayersPanel />);
    expect(screen.getByText(/Aucun élément/)).toBeInTheDocument();
  });

  it("ordre d'empilement (premier = au-dessus), type, couleur et fenêtre temporelle", () => {
    store().addElement(shape({ id: "a", startTime: 2, endTime: 5.3 }), { select: false });
    store().addElement(text({ id: "b", text: "Salut", color: "#FF0000" }), { select: false });
    render(<LayersPanel />);
    const [top, bottom] = rows();
    expect(top).toHaveTextContent("Texte « Salut »");
    expect(top).toHaveTextContent("0,0 s jusqu'à la fin");
    expect(bottom).toHaveTextContent("Carré");
    expect(bottom).toHaveTextContent("2,0 s à 5,3 s");
    expect(screen.getByLabelText("2 élément(s)")).toBeInTheDocument();
  });

  it("clic : sélection, et saut au début d'un élément invisible", () => {
    store().addElement(shape({ id: "a", startTime: 4, endTime: 6 }), { select: false });
    render(<LayersPanel />);
    fireEvent.click(within(rows()[0]!).getByRole("button", { name: "Carré, 4,0 s à 6,0 s" }));
    expect(store().selectedId).toBe("a");
    expect(store().seekRequest?.time).toBe(4);
    expect(
      within(rows()[0]!).getByRole("button", { name: "Carré, 4,0 s à 6,0 s" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("mettre en avant / en arrière, bornes désactivées, annulable", () => {
    store().addElement(shape({ id: "a" }), { select: false });
    store().addElement(shape({ id: "b", shape: "circle" }), { select: false });
    render(<LayersPanel />);
    expect(screen.getByRole("button", { name: "Mettre en avant Rond" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mettre en arrière Carré" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mettre en avant Carré" }));
    expect(store().elements.map((e) => e.id)).toEqual(["b", "a"]);
    expect(rows()[0]).toHaveTextContent("Carré");
    store().undo();
    expect(store().elements.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("supprimer en vidéo : fin de vie au temps courant", () => {
    store().addElement(shape({ id: "a", startTime: 1 }), { select: false });
    store().setCurrentTime(3);
    render(<LayersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Carré" }));
    expect(store().elements[0]?.endTime).toBe(3);
  });

  it("image : suppression définitive, pas de fenêtre temporelle", () => {
    setup(IMAGE);
    store().addElement(shape({ id: "a" }), { select: false });
    render(<LayersPanel />);
    expect(rows()[0]).not.toHaveTextContent("jusqu'à la fin");
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Carré" }));
    expect(store().elements).toHaveLength(0);
  });
});
