import { describe, expect, it } from "vitest";

import { line, shape, shape3d, stroke, text } from "../test-utils/fixtures";
import { getHandles, hitTestHandle } from "./handles";
import { findElementAt, hitTestElement, type HitOptions } from "./hitTest";
import { approximateTextWidth } from "./text";

const opts: HitOptions = { tolerance: 4, lineTolerance: 15, measure: approximateTextWidth };

describe("hitTestElement — formes 2D (géométrie réelle)", () => {
  it("carré : intérieur et tolérance du contour", () => {
    expect(hitTestElement(shape(), { x: 150, y: 150 }, opts)).toBe(true);
    expect(hitTestElement(shape(), { x: 204, y: 150 }, opts)).toBe(true);
    expect(hitTestElement(shape(), { x: 220, y: 150 }, opts)).toBe(false);
  });
  it("rond : le coin de la boîte n'est plus sélectionnable (bug d'origine)", () => {
    const circle = shape({ shape: "circle" });
    expect(hitTestElement(circle, { x: 150, y: 150 }, opts)).toBe(true);
    expect(hitTestElement(circle, { x: 102, y: 102 }, opts)).toBe(false);
  });
  it("triangle, triangle inversé, losange, hexagone", () => {
    expect(hitTestElement(shape({ shape: "triangle" }), { x: 150, y: 180 }, opts)).toBe(true);
    expect(hitTestElement(shape({ shape: "triangle" }), { x: 105, y: 105 }, opts)).toBe(false);
    const inverted = shape({ shape: "triangle-inverted" });
    expect(hitTestElement(inverted, { x: 150, y: 120 }, opts)).toBe(true);
    expect(hitTestElement(inverted, { x: 105, y: 195 }, opts)).toBe(false);
    expect(hitTestElement(shape({ shape: "diamond" }), { x: 105, y: 105 }, opts)).toBe(false);
    expect(hitTestElement(shape({ shape: "diamond" }), { x: 150, y: 150 }, opts)).toBe(true);
    expect(hitTestElement(shape({ shape: "hexagon" }), { x: 150, y: 150 }, opts)).toBe(true);
    expect(hitTestElement(shape({ shape: "hexagon" }), { x: 101, y: 101 }, opts)).toBe(false);
  });
  it("carré arrondi : boîte englobante", () => {
    expect(hitTestElement(shape({ shape: "rounded-square" }), { x: 101, y: 101 }, opts)).toBe(true);
  });
});

describe("hitTestElement — objets 3D", () => {
  it("bille : disque inscrit", () => {
    const sphere = shape3d({ shape: "sphere" });
    expect(hitTestElement(sphere, { x: 140, y: 140 }, opts)).toBe(true);
    expect(hitTestElement(sphere, { x: 101, y: 101 }, opts)).toBe(false);
  });
  it("cube tourné : l'emprise projetée déborde du rectangle et reste sélectionnable", () => {
    const cube = shape3d({ rotationY: Math.PI / 4, rotationX: Math.PI / 5 });
    // demi-diagonale projetée ≈ 0,69 × 80 / 2,5 × … > 40 : point hors du rectangle
    expect(hitTestElement(cube, { x: 140, y: 140 }, opts)).toBe(true);
    expect(hitTestElement(shape3d(), { x: 300, y: 300 }, opts)).toBe(false);
  });
});

describe("hitTestElement — lignes, texte, tracés", () => {
  it("flèche : distance au segment inférieure à la tolérance", () => {
    expect(hitTestElement(line(), { x: 180, y: 210 }, opts)).toBe(true);
    expect(hitTestElement(line(), { x: 180, y: 230 }, opts)).toBe(false);
  });
  it("courbe : le tracé réel est testé, pas le segment droit (bug d'origine)", () => {
    const curved = line({ line: "curved" });
    // contrôle (180, 152), donc sommet de la courbe en (180, 176)
    expect(hitTestElement(curved, { x: 180, y: 176 }, opts)).toBe(true);
    expect(hitTestElement(curved, { x: 180, y: 200 }, opts)).toBe(false);
  });
  it("ligne torsadée : sommets du zigzag", () => {
    const zigzag = line({ line: "zigzag" });
    // 1er sommet : t = 1/8, côté −amplitude (10) le long de la normale (0, 1)
    expect(hitTestElement(zigzag, { x: 120, y: 190 }, opts)).toBe(true);
  });
  it("texte : boîte mesurée avec la police de l'élément", () => {
    expect(hitTestElement(text(), { x: 60, y: 65 }, opts)).toBe(true);
    expect(hitTestElement(text(), { x: 60, y: 40 }, opts)).toBe(false);
    expect(hitTestElement(text({ fontSize: 48 }), { x: 60, y: 40 }, opts)).toBe(true);
  });
  it("tracés : crayon sélectionnable, gomme jamais", () => {
    expect(hitTestElement(stroke(), { x: 30, y: 14 }, opts)).toBe(true);
    expect(hitTestElement(stroke({ tool: "eraser" }), { x: 30, y: 10 }, opts)).toBe(false);
  });
});

describe("findElementAt", () => {
  it("renvoie l'élément visible le plus haut", () => {
    const a = shape({ id: "a" });
    const b = shape({ id: "b", x: 120, y: 120 });
    expect(findElementAt([a, b], { x: 150, y: 150 }, 0, opts)?.id).toBe("b");
  });
  it("ignore les éléments hors de leur fenêtre temporelle", () => {
    const later = shape({ id: "later", startTime: 5 });
    const ended = shape({ id: "ended", endTime: 2 });
    expect(findElementAt([later], { x: 150, y: 150 }, 1, opts)).toBeNull();
    expect(findElementAt([later], { x: 150, y: 150 }, 5, opts)?.id).toBe("later");
    expect(findElementAt([ended], { x: 150, y: 150 }, 2, opts)).toBeNull();
  });
});

describe("poignées", () => {
  it("8 poignées pour formes, 3D et texte ; 2 pour une ligne ; aucune pour un tracé", () => {
    expect(getHandles(shape(), approximateTextWidth).map((h) => h.id)).toEqual([
      "nw",
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
    ]);
    expect(getHandles(shape3d(), approximateTextWidth)).toHaveLength(8);
    expect(getHandles(text(), approximateTextWidth)).toHaveLength(8);
    expect(getHandles(line(), approximateTextWidth).map((h) => h.id)).toEqual(["start", "end"]);
    expect(getHandles(stroke(), approximateTextWidth)).toHaveLength(0);
  });
  it("positionne les poignées sur la boîte", () => {
    const handles = getHandles(shape(), approximateTextWidth);
    expect(handles.find((h) => h.id === "se")?.point).toEqual({ x: 200, y: 200 });
    expect(handles.find((h) => h.id === "w")?.point).toEqual({ x: 100, y: 150 });
  });
  it("saisit la poignée la plus proche dans la tolérance", () => {
    expect(hitTestHandle(shape(), { x: 195, y: 205 }, 12, approximateTextWidth)).toBe("se");
    expect(hitTestHandle(shape(), { x: 150, y: 150 }, 12, approximateTextWidth)).toBeNull();
    expect(hitTestHandle(line(), { x: 258, y: 201 }, 12, approximateTextWidth)).toBe("end");
  });
});
