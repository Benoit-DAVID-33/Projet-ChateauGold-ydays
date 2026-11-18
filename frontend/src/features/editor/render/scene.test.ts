import { describe, expect, it } from "vitest";

import { HANDLE_FILL } from "../model/constants";
import { approximateTextWidth } from "../model/text";
import { line, shape, shape3d, stroke, text } from "../test-utils/fixtures";
import { createRecordingContext } from "../test-utils/recordingContext";
import { renderScene, type SceneOptions } from "./scene";

const screen: SceneOptions = { time: 0, mode: "screen", measure: approximateTextWidth };
const exporting: SceneOptions = { time: 0, mode: "export", measure: approximateTextWidth };

const isHandleFill = (state: { fillStyle: unknown }) => state.fillStyle === HANDLE_FILL;

describe("formes 2D", () => {
  it("carré : remplissage couleur à 55 % puis contour, épaisseur de l'élément", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape({ color: "#FF0000", strokeWidth: 6 })], exporting);
    const [fill] = rec.callsOf("fillRect");
    const [outline] = rec.callsOf("strokeRect");
    expect(fill?.args).toEqual([100, 100, 100, 100]);
    expect(fill?.state.fillStyle).toBe("rgba(255, 0, 0, 0.55)");
    expect(outline?.state).toMatchObject({ strokeStyle: "#FF0000", lineWidth: 6 });
  });
  it("couleur par défaut identique à l'original", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape({ shape: "circle" })], exporting);
    expect(rec.callsOf("arc")[0]?.args.slice(0, 3)).toEqual([150, 150, 50]);
    expect(rec.callsOf("fill")[0]?.state.fillStyle).toBe("rgba(255, 215, 0, 0.55)");
  });
  it("carré arrondi : 4 coins en courbes quadratiques", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape({ shape: "rounded-square" })], exporting);
    expect(rec.callsOf("quadraticCurveTo")).toHaveLength(4);
  });
});

describe("tracés libres", () => {
  it("feutre : multiply et opacité 0,3", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [stroke({ tool: "marker", color: "#00FF00" })], exporting);
    const [draw] = rec.callsOf("stroke");
    expect(draw?.state).toMatchObject({
      globalCompositeOperation: "multiply",
      globalAlpha: 0.3,
      strokeStyle: "#00FF00",
      lineWidth: 5,
    });
  });
  it("gomme : destination-out (calque d'annotations uniquement)", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape(), stroke({ tool: "eraser" })], exporting);
    const strokes = rec.callsOf("stroke");
    expect(strokes.at(-1)?.state.globalCompositeOperation).toBe("destination-out");
    // l'état est restauré : rien ne « fuit » vers les éléments suivants
    expect(rec.ctx.globalCompositeOperation).toBe("source-over");
  });
  it("crayon : trait plein ; un simple clic donne un point", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [stroke({ points: [{ x: 5, y: 5 }] })], exporting);
    expect(rec.callsOf("arc")[0]?.args.slice(0, 3)).toEqual([5, 5, 2.5]);
    expect(rec.callsOf("fill")[0]?.state.globalCompositeOperation).toBe("source-over");
  });
});

describe("texte", () => {
  it("utilise la taille DE L'ÉLÉMENT (bug d'origine) et la ligne de base", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [text({ fontSize: 40, color: "#0000FF" })], exporting);
    const [outline] = rec.callsOf("strokeText");
    const [fill] = rec.callsOf("fillText");
    expect(outline?.state).toMatchObject({
      font: "bold 40px Arial",
      strokeStyle: "#000000",
      textBaseline: "alphabetic",
    });
    expect(fill?.state.fillStyle).toBe("#0000FF");
    expect(rec.methods().indexOf("strokeText")).toBeLessThan(rec.methods().indexOf("fillText"));
  });
});

describe("lignes et objets 3D", () => {
  it("flèche : segment puis tête pleine", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [line()], exporting);
    expect(rec.callsOf("stroke")).toHaveLength(1);
    expect(rec.callsOf("fill")).toHaveLength(1);
  });
  it("zigzag de longueur nulle : aucune coordonnée NaN", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [line({ line: "zigzag", end: { x: 100, y: 200 } })], exporting);
    const coords = rec.calls.flatMap((c) => c.args).filter((a) => typeof a === "number");
    expect(coords.some((n) => Number.isNaN(n))).toBe(false);
  });
  it("cube : 6 faces translucides d'opacité croissante", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape3d({ rotationX: 0.4, rotationY: 0.6 })], exporting);
    expect(rec.callsOf("fill").map((c) => c.state.fillStyle)).toEqual([
      "rgba(255, 215, 0, 0.25)",
      "rgba(255, 215, 0, 0.35)",
      "rgba(255, 215, 0, 0.4)",
      "rgba(255, 215, 0, 0.45)",
      "rgba(255, 215, 0, 0.5)",
      "rgba(255, 215, 0, 0.55)",
    ]);
  });
  it("bille : reflet et ombre en dégradés radiaux dérivés de la couleur", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape3d({ shape: "sphere" })], exporting);
    expect(rec.gradients).toHaveLength(2);
    expect(rec.gradients[0]?.stops[2]).toEqual([0.7, "rgba(255, 215, 0, 0.4)"]);
    expect(rec.gradients[1]?.stops[0]).toEqual([0, "rgba(0, 0, 0, 0)"]);
  });
  it("hexagone 3D : deux faces et six arêtes", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape3d({ shape: "hexagon3d" })], exporting);
    expect(rec.callsOf("fill")).toHaveLength(2);
    expect(rec.callsOf("stroke")).toHaveLength(8);
  });
});

describe("scène", () => {
  it("n'affiche que les éléments visibles à l'instant t", () => {
    const rec = createRecordingContext();
    const elements = [shape({ id: "a", startTime: 2 }), shape({ id: "b", endTime: 1 })];
    renderScene(rec.ctx, elements, { ...exporting, time: 1.5 });
    expect(rec.callsOf("fillRect")).toHaveLength(0);
    renderScene(rec.ctx, elements, { ...exporting, time: 2 });
    expect(rec.callsOf("fillRect")).toHaveLength(1);
  });
  it("écran : 8 poignées pour l'élément sélectionné, taille constante à l'écran", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape()], { ...screen, selectedId: "shape_1", unitsPerPx: 2 });
    const handles = rec.callsOf("arc").filter((c) => isHandleFill(c.state));
    expect(handles).toHaveLength(8);
    expect(handles[0]?.args[2]).toBe(16); // rayon 8 px écran × 2
  });
  it("export : jamais de poignées ni de badge, même avec une sélection", () => {
    const rec = createRecordingContext();
    const el = shape({ motionTracking: true });
    renderScene(rec.ctx, [el], { ...exporting, selectedId: el.id });
    expect(
      rec.calls.some((c) => isHandleFill(c.state) || c.state.strokeStyle === HANDLE_FILL),
    ).toBe(false);
    expect(rec.callsOf("fillRect")).toHaveLength(1);
  });
  it("écran : badge « Motion Tracking » sur les éléments marqués", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [shape({ motionTracking: true })], screen);
    expect(rec.callsOf("arc")).toHaveLength(1);
  });
  it("écran : contour pointillé pour un tracé sélectionné", () => {
    const rec = createRecordingContext();
    renderScene(rec.ctx, [stroke()], { ...screen, selectedId: "stroke_1" });
    expect(rec.callsOf("stroke").at(-1)?.state.lineDash).toEqual([6, 4]);
  });
  it("save/restore équilibrés", () => {
    const rec = createRecordingContext();
    renderScene(
      rec.ctx,
      [shape(), shape3d(), line({ line: "curved" }), text(), stroke({ tool: "eraser" })],
      { ...screen, selectedId: "text_1" },
    );
    expect(rec.callsOf("save").length).toBe(rec.callsOf("restore").length);
  });
});
