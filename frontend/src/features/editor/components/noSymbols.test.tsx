/**
 * Règle produit : aucun emoji ni symbole décoratif dans l'éditeur (interface,
 * libellés, aria-label, title, README, tests). Plages interdites : flèches,
 * symboles techniques, formes géométriques, dingbats, flèches et formes
 * supplémentaires, emojis, sélecteur de variante emoji.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "../store/editorStore";
import { createRecordingContext } from "../test-utils/recordingContext";
import { shape, shape3d, stroke, text } from "../test-utils/fixtures";
import { forbiddenSymbols } from "../test-utils/symbols";
import { LayersPanel } from "./LayersPanel";
import { MediaEditor } from "./MediaEditor";
import { TimelinePanel } from "./TimelinePanel";
import { ToolsMenu } from "./ToolsMenu";
import { ToolsSidebar } from "./ToolsSidebar";

// Les CSS ne sont pas lisibles en brut sous `css: false` : vérifiées par grep en CI locale.
const sources = import.meta.glob("../**/*.{ts,tsx,md}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Texte visible et attributs lus par les lecteurs d'écran / infobulles. */
function exposedText(root: ParentNode): string {
  const parts: (string | null)[] = [
    root instanceof Element ? root.textContent : document.body.textContent,
  ];
  for (const el of root.querySelectorAll(
    "[aria-label], [title], [placeholder], [aria-valuetext]",
  )) {
    for (const attr of ["aria-label", "title", "placeholder", "aria-valuetext"]) {
      parts.push(el.getAttribute(attr));
    }
  }
  return parts.filter(Boolean).join("\n");
}

describe("aucun emoji ni symbole décoratif", () => {
  it("le détecteur repère bien emojis et symboles, pas le français", () => {
    expect(forbiddenSymbols(`a${String.fromCodePoint(0x1f9ca, 0x27f2)}`)).toEqual([
      "U+1F9CA",
      "U+27F2",
    ]);
    expect(forbiddenSymbols("Élément « 2,0 s » – fin…")).toEqual([]);
  });

  it("dans les fichiers du dossier editor (code, README, tests)", () => {
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThan(40);
    const offenders = files.flatMap((file) =>
      forbiddenSymbols(sources[file]!).map((code) => `${file} ${code}`),
    );
    expect(offenders).toEqual([]);
  });

  describe("dans l'interface rendue", () => {
    beforeEach(() => {
      useEditorStore.setState(useEditorStore.getInitialState(), true);
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        () => createRecordingContext().ctx as never,
      );
    });
    afterEach(() => vi.restoreAllMocks());

    it("menus d'outils, colonne, calques, chronologie, éditeur et menu contextuel", () => {
      const media = { id: "v", kind: "video", name: "clip.mp4", content_url: "/v.mp4" } as const;
      render(
        <>
          <MediaEditor media={media} />
          <ToolsSidebar />
          <LayersPanel />
          <TimelinePanel />
        </>,
      );
      act(() =>
        useEditorStore.setState({
          mediaInfo: { kind: "video", name: "clip.mp4", width: 800, height: 600, duration: 10 },
          elements: [
            shape(),
            shape3d({ motionTracking: true }),
            text(),
            stroke({ tool: "eraser" }),
          ],
          selectedId: "shape3d_1",
          tool: { kind: "stroke", tool: "marker" },
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Actions de l'élément" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(forbiddenSymbols(exposedText(document.body))).toEqual([]);
    });

    it("chaque sous-panneau du tiroir ToolsMenu", () => {
      render(<ToolsMenu open onOpenChange={() => {}} />);
      for (const entry of ["Formes", "Lignes", "Texte", "Dessin", "Objets 3D"]) {
        fireEvent.click(screen.getByRole("button", { name: entry }));
        expect(forbiddenSymbols(exposedText(document.body))).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Retour" }));
      }
    });
  });
});
