import { beforeEach, describe, expect, it } from "vitest";

import { approximateTextWidth } from "../model/text";
import type { Shape3DElement, ShapeElement } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { line, shape, shape3d } from "../test-utils/fixtures";
import { clientToNative, nativeToClient, visibleCenter } from "./coords";
import {
  applyGesture,
  decidePointerDown,
  hoverAt,
  toolCursor,
  type PointerSample,
} from "./gestures";

const measure = approximateTextWidth;
const at = (x: number, y: number, mods: Partial<PointerSample> = {}): PointerSample => ({
  point: { x, y },
  client: { x, y },
  shiftKey: false,
  altKey: false,
  ...mods,
});
const state = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  useEditorStore.setState({ elements: [shape(), shape3d({ x: 400, y: 400 })] });
});

describe("decidePointerDown", () => {
  it("rien sous le pointeur : laisse passer l'événement (contrôles vidéo)", () => {
    expect(decidePointerDown(state(), at(10, 10), 1, measure)).toEqual({ action: "pass-through" });
  });
  it("élément : déplacement", () => {
    const d = decidePointerDown(state(), at(150, 150), 1, measure);
    expect(d).toMatchObject({ action: "gesture", gesture: { kind: "move", id: "shape_1" } });
  });
  it("poignée de l'élément sélectionné : redimensionnement prioritaire", () => {
    useEditorStore.setState({ selectedId: "shape_1" });
    const d = decidePointerDown(state(), at(198, 198), 1, measure);
    expect(d).toMatchObject({ gesture: { kind: "resize", handle: "se" } });
  });
  it("objet 3D + Maj ou Alt : rotation", () => {
    const d = decidePointerDown(state(), at(440, 440, { altKey: true }), 1, measure);
    expect(d).toMatchObject({ gesture: { kind: "rotate", id: "shape3d_1" } });
  });
  it("« Faire tourner » armé : rotation sans modificateur", () => {
    useEditorStore.setState({ rotateArmed: true });
    const d = decidePointerDown(state(), at(440, 440), 1, measure);
    expect(d).toMatchObject({ gesture: { kind: "rotate" } });
  });
  it("outils : texte puis dessin libre ont priorité sur la sélection (gomme comprise)", () => {
    useEditorStore.setState({ tool: { kind: "text", text: "A", fontSize: 24 } });
    expect(decidePointerDown(state(), at(150, 150), 1, measure)).toEqual({ action: "place-text" });
    useEditorStore.setState({ tool: { kind: "stroke", tool: "eraser" } });
    expect(decidePointerDown(state(), at(150, 150), 1, measure)).toEqual({ action: "draw" });
  });
});

describe("applyGesture", () => {
  it("déplacement relatif à l'état de départ (pas de saut, bug d'origine)", () => {
    const base = line();
    const moved = applyGesture(
      { kind: "move", id: base.id, origin: { x: 150, y: 200 }, base },
      at(160, 230),
      1,
      measure,
    );
    expect(moved).toMatchObject({ start: { x: 110, y: 230 }, end: { x: 270, y: 230 } });
  });
  it("redimensionnement avec taille minimale convertie en pixels natifs", () => {
    const base = shape();
    const resized = applyGesture(
      { kind: "resize", id: base.id, handle: "e", origin: { x: 200, y: 150 }, base },
      at(0, 150),
      2,
      measure,
    ) as ShapeElement;
    expect(resized.width).toBe(40); // 20 px écran × 2
  });
  it("rotation en pixels écran", () => {
    const base = shape3d();
    const rotated = applyGesture(
      { kind: "rotate", id: base.id, originClient: { x: 0, y: 0 }, base },
      at(0, 0, { client: { x: 50, y: 0 } }),
      1,
      measure,
    ) as Shape3DElement;
    expect(rotated.rotationY).toBeCloseTo(0.6);
  });
});

describe("survol et curseurs", () => {
  it("curseurs d'origine", () => {
    useEditorStore.setState({ selectedId: "shape_1" });
    expect(hoverAt(state(), { x: 100, y: 100 }, 1, measure)).toEqual({
      cursor: "nw-resize",
      overElement: true,
    });
    expect(hoverAt(state(), { x: 150, y: 150 }, 1, measure).cursor).toBe("move");
    expect(hoverAt(state(), { x: 5, y: 5 }, 1, measure)).toEqual({
      cursor: "default",
      overElement: false,
    });
    expect(toolCursor({ kind: "text", text: "a", fontSize: 1 }, false)).toBe("text");
    expect(toolCursor({ kind: "stroke", tool: "pencil" }, false)).toBe("crosshair");
    expect(toolCursor({ kind: "none" }, true)).toBe("grab");
    expect(toolCursor({ kind: "none" }, false)).toBeNull();
  });
});

describe("coordonnées écran et natives", () => {
  const metrics = {
    rect: { left: 10, top: 20, width: 400, height: 300 },
    info: { width: 800, height: 600 },
  };
  it("convertit dans les deux sens (zoom compris dans le rectangle)", () => {
    expect(clientToNative(metrics, 210, 170)).toEqual({ x: 400, y: 300 });
    expect(nativeToClient(metrics, { x: 400, y: 300 })).toEqual({ x: 210, y: 170 });
  });
  it("centre de la partie visible quand le média déborde (zoom)", () => {
    const viewport = { left: 10, top: 20, width: 200, height: 100 };
    expect(visibleCenter(metrics, viewport)).toEqual({ x: 200, y: 100 });
  });
});
