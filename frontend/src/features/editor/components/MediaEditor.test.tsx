import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "../store/editorStore";
import { createRecordingContext } from "../test-utils/recordingContext";
import { MediaEditor, type EditorMedia, type MediaEditorHandle } from "./MediaEditor";
import styles from "./MediaEditor.module.css";

const IMAGE: EditorMedia = {
  id: "m1",
  kind: "image",
  name: "photo.png",
  content_url: "/api/media/m1/content",
};
const VIDEO: EditorMedia = {
  id: "m2",
  kind: "video",
  name: "clip.mp4",
  content_url: "/api/media/m2/content",
};

const store = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => createRecordingContext().ctx as never,
  );
});
afterEach(() => vi.restoreAllMocks());

function define(el: object, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
}

/** Image 800×600 affichée sur 400×300 : 1 px écran = 2 px natifs. */
function renderLoadedImage(ref?: React.Ref<MediaEditorHandle>) {
  const utils = render(<MediaEditor media={IMAGE} ref={ref} />);
  const img = screen.getByRole("img", { name: "photo.png" }) as HTMLImageElement;
  define(img, { naturalWidth: 800, naturalHeight: 600, complete: true });
  fireEvent.load(img);
  const layer = screen.getByTestId("annotation-layer");
  layer.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
  return {
    ...utils,
    img,
    layer,
    viewport: screen.getByRole("group", { name: "Édition : photo.png" }),
  };
}

const pointer = { isPrimary: true, button: 0, pointerId: 1, pointerType: "mouse" };

describe("MediaEditor — rendu", () => {
  it("affiche le média, le calque et le zoom (0,5 à 5 par pas de 0,25)", () => {
    render(<MediaEditor media={IMAGE} />);
    const img = screen.getByRole("img", { name: "photo.png" });
    expect(img).toHaveAttribute("src", IMAGE.content_url);
    expect(screen.getByTestId("annotation-layer")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom avant" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    for (let i = 0; i < 3; i++)
      fireEvent.click(screen.getByRole("button", { name: "Zoom arrière" }));
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom arrière" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser le zoom" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("réinitialise le store et renseigne mediaInfo au chargement", () => {
    store().addElement({
      id: "old",
      type: "shape",
      shape: "square",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      color: "#000000",
      strokeWidth: 1,
      startTime: 0,
      endTime: null,
      motionTracking: false,
    });
    const { rerender } = renderLoadedImage();
    expect(store().elements).toEqual([]);
    expect(store().mediaInfo).toEqual({
      kind: "image",
      name: "photo.png",
      width: 800,
      height: 600,
    });

    rerender(<MediaEditor media={VIDEO} />);
    expect(store().mediaInfo).toBeNull();
    expect(store().mediaKind).toBe("video");
  });

  it("vidéo : lecteur natif avec contrôles, métadonnées et durée", () => {
    const { container } = render(<MediaEditor media={VIDEO} />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("controls");
    define(video, { videoWidth: 1920, videoHeight: 1080, duration: 12.5 });
    fireEvent.loadedMetadata(video);
    expect(store().mediaInfo).toEqual({
      kind: "video",
      name: "clip.mp4",
      width: 1920,
      height: 1080,
      duration: 12.5,
    });
  });

  it("le calque laisse passer les clics (contrôles vidéo) sauf outil actif", () => {
    const { layer } = renderLoadedImage();
    expect(layer.className).not.toContain(styles.capturing);
    act(() => store().activateStrokeTool("pencil"));
    expect(layer.className).toContain(styles.capturing);
    expect(screen.getByText("Crayon actif")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    expect(store().tool.kind).toBe("none");
    expect(layer.className).not.toContain(styles.capturing);
  });
});

describe("MediaEditor — interactions", () => {
  it("place une forme de 100 px écran, la déplace au pointeur (une entrée d'historique)", () => {
    const { layer } = renderLoadedImage();
    act(() => {
      store().addShape("square");
      store().select(null);
    });
    expect(store().elements[0]).toMatchObject({ x: 300, y: 200, width: 200, height: 200 });

    fireEvent.pointerDown(layer, { ...pointer, clientX: 200, clientY: 150 });
    expect(store().selectedId).toBe(store().elements[0]?.id);
    fireEvent.pointerMove(layer, { ...pointer, clientX: 210, clientY: 160 });
    fireEvent.pointerUp(layer, { ...pointer, clientX: 210, clientY: 160 });
    expect(store().elements[0]).toMatchObject({ x: 320, y: 220 });
    expect(store().history.past).toHaveLength(2);
  });

  it("clavier : Suppr supprime, Ctrl+Z annule, Échap désélectionne", () => {
    const { viewport } = renderLoadedImage();
    act(() => void store().addShape("circle"));
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(store().selectedId).toBeNull();
    act(() => store().select(store().elements[0]!.id));
    fireEvent.keyDown(viewport, { key: "Delete" });
    expect(store().elements).toHaveLength(0);
    fireEvent.keyDown(viewport, { key: "z", ctrlKey: true });
    expect(store().elements).toHaveLength(1);
    fireEvent.keyDown(viewport, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(store().elements).toHaveLength(0);
  });

  it("les raccourcis ignorent les champs de saisie", () => {
    renderLoadedImage();
    act(() => void store().addShape("circle"));
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(store().elements).toHaveLength(1);
    input.remove();
  });

  it("mode texte : un clic pose le texte à la taille choisie", () => {
    const { layer } = renderLoadedImage();
    act(() => {
      store().setTextDraft("Salut");
      store().activateTextMode();
    });
    fireEvent.pointerDown(layer, { ...pointer, clientX: 50, clientY: 40 });
    expect(store().elements[0]).toMatchObject({
      type: "text",
      text: "Salut",
      x: 100,
      fontSize: 48,
    });
  });

  it("molette : redimensionne la sélection seulement, Ctrl+molette zoome", () => {
    const { layer } = renderLoadedImage();
    act(() => void store().addShape("square"));
    expect(fireEvent.wheel(layer, { deltaY: -100 })).toBe(false); // défilement bloqué
    expect(store().elements[0]).toMatchObject({ width: expect.closeTo(220) });
    act(() => store().select(null));
    expect(fireEvent.wheel(layer, { deltaY: -100 })).toBe(true); // la page défile
    fireEvent.wheel(layer, { deltaY: -100, ctrlKey: true });
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("menu contextuel image : Supprimer (pas de Motion Tracking)", () => {
    const { layer } = renderLoadedImage();
    act(() => void store().addShape("square"));
    fireEvent.contextMenu(layer, { clientX: 200, clientY: 150 });
    const menu = screen.getByRole("menu", { name: "Actions de l'élément" });
    expect(within(menu).queryByText("Motion Tracking")).not.toBeInTheDocument();
    expect(within(menu).queryByText("Faire tourner")).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Supprimer" }));
    expect(store().elements).toHaveLength(0);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("menu contextuel au clavier (Maj+F10) et après Ctrl+clic / appui long", () => {
    const { layer, viewport } = renderLoadedImage();
    act(() => void store().addShape("square"));
    fireEvent.keyDown(viewport, { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Supprimer" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // macOS : Ctrl+clic = pointerdown principal puis contextmenu, sans pointerup entre les deux.
    fireEvent.pointerDown(layer, { ...pointer, clientX: 200, clientY: 150, ctrlKey: true });
    fireEvent.contextMenu(layer, { clientX: 200, clientY: 150, ctrlKey: true });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(store().gestureBase).toBeNull();
  });

  it("menu contextuel vidéo : Faire tourner (3D), Motion Tracking avec son état", () => {
    const { container } = render(<MediaEditor media={VIDEO} />);
    const video = container.querySelector("video")!;
    define(video, { videoWidth: 800, videoHeight: 600, duration: 10 });
    fireEvent.loadedMetadata(video);
    const layer = screen.getByTestId("annotation-layer");
    layer.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
    act(() => void store().addShape3D("cube"));

    fireEvent.contextMenu(layer, { clientX: 200, clientY: 150 });
    const tracking = screen.getByRole("menuitemcheckbox", { name: /Motion Tracking/ });
    expect(tracking).toHaveAttribute("aria-checked", "false");
    expect(within(tracking).getByText("Désactivé")).toBeInTheDocument();
    fireEvent.click(tracking);
    expect(store().elements[0]?.motionTracking).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Actions de l'élément" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Faire tourner" }));
    expect(store().rotateArmed).toBe(true);
    fireEvent.pointerDown(layer, { ...pointer, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(layer, { ...pointer, clientX: 250, clientY: 150 });
    fireEvent.pointerUp(layer, { ...pointer, clientX: 250, clientY: 150 });
    expect(store().elements[0]).toMatchObject({ rotationY: expect.closeTo(0.6) });
  });
});

describe("MediaEditor — API impérative", () => {
  it("expose getElements, getMediaInfo, exportImage et refuse recordVideo sur une image", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob(["png"], { type: "image/png" }));
    });
    const ref = createRef<MediaEditorHandle>();
    renderLoadedImage(ref);
    act(() => void store().addShape("hexagon"));
    expect(ref.current?.getElements()).toBe(store().elements);
    expect(ref.current?.getMediaInfo()).toMatchObject({ width: 800, height: 600 });
    await expect(ref.current!.exportImage()).resolves.toMatchObject({ type: "image/png" });
    await expect(ref.current!.recordVideo()).rejects.toThrow(
      "L'enregistrement n'est disponible que pour une vidéo.",
    );
  });
});
