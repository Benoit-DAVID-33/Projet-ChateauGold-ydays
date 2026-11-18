import { describe, expect, it } from "vitest";

import { line, shape, shape3d, stroke, text } from "../test-utils/fixtures";
import type { BoxHandle } from "./handles";
import { approximateTextWidth, textBounds } from "./text";
import {
  clampToward,
  resizeElement,
  resizeRect,
  rotateShape3D,
  scaleElement,
  translateElement,
  type SizeLimits,
} from "./transform";
import type {
  LineElement,
  Shape3DElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from "./types";

const limits: SizeLimits = {
  minSize: 20,
  minFontSize: 12,
  maxFontSize: 72,
  measure: approximateTextWidth,
};
const base = { x: 100, y: 100, width: 100, height: 100 };

describe("translateElement", () => {
  it("déplace chaque type d'élément", () => {
    expect(translateElement(shape(), 10, -5)).toMatchObject({ x: 110, y: 95 });
    expect(translateElement(text(), 10, -5)).toMatchObject({ x: 60, y: 69 });
    const moved = translateElement(line(), 10, -5) as LineElement;
    expect(moved.start).toEqual({ x: 110, y: 195 });
    expect(moved.end).toEqual({ x: 270, y: 195 });
    const drawn = translateElement(stroke(), 1, 1) as StrokeElement;
    expect(drawn.points[0]).toEqual({ x: 11, y: 11 });
  });
});

describe("resizeRect (8 poignées, côté opposé fixe)", () => {
  const cases: [BoxHandle, number, number, object][] = [
    ["nw", -10, -20, { x: 90, y: 80, width: 110, height: 120 }],
    ["n", 50, -20, { x: 100, y: 80, width: 100, height: 120 }],
    ["ne", 10, -20, { x: 100, y: 80, width: 110, height: 120 }],
    ["e", 30, 99, { x: 100, y: 100, width: 130, height: 100 }],
    ["se", 30, 40, { x: 100, y: 100, width: 130, height: 140 }],
    ["s", 99, 40, { x: 100, y: 100, width: 100, height: 140 }],
    ["sw", -30, 40, { x: 70, y: 100, width: 130, height: 140 }],
    ["w", -30, 99, { x: 70, y: 100, width: 130, height: 100 }],
  ];
  it.each(cases)("poignée %s", (handle, dx, dy, expected) => {
    expect(resizeRect(base, handle, dx, dy, 20)).toEqual(expected);
  });
  it("bloque à la taille minimale SANS faire glisser la forme (bug d'origine)", () => {
    expect(resizeRect(base, "nw", 500, 500, 20)).toEqual({ x: 180, y: 180, width: 20, height: 20 });
    expect(resizeRect(base, "se", -500, -500, 20)).toEqual({
      x: 100,
      y: 100,
      width: 20,
      height: 20,
    });
  });
  it("ne fait pas sauter une forme déjà plus petite que le minimum", () => {
    expect(resizeRect({ x: 0, y: 0, width: 10, height: 10 }, "e", 2, 0, 20).width).toBe(12);
  });
});

describe("resizeElement", () => {
  it("formes et objets 3D", () => {
    expect(resizeElement(shape(), "se", 50, 50, limits)).toMatchObject({ width: 150, height: 150 });
    const cube = resizeElement(shape3d(), "w", -20, 0, limits) as Shape3DElement;
    expect(cube).toMatchObject({ x: 80, width: 100, rotationX: 0 });
  });
  it("lignes : l'extrémité saisie suit le pointeur", () => {
    const moved = resizeElement(line(), "end", 10, 30, limits) as LineElement;
    expect(moved.end).toEqual({ x: 270, y: 230 });
    expect(moved.start).toEqual({ x: 100, y: 200 });
  });
  it("texte : la taille de police change et la poignée opposée reste fixe", () => {
    const t = text();
    const before = textBounds(t, approximateTextWidth);
    const grown = resizeElement(t, "se", before.width, before.height, limits) as TextElement;
    expect(grown.fontSize).toBeCloseTo(48);
    const after = textBounds(grown, approximateTextWidth);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);

    const fromNw = resizeElement(t, "nw", -before.width, -before.height, limits) as TextElement;
    const box = textBounds(fromNw, approximateTextWidth);
    expect(box.x + box.width).toBeCloseTo(before.x + before.width);
    expect(box.y + box.height).toBeCloseTo(before.y + before.height);
  });
  it("texte : borné entre 12 et 72", () => {
    const huge = resizeElement(text(), "se", 5000, 5000, limits) as TextElement;
    const tiny = resizeElement(text(), "se", -5000, -5000, limits) as TextElement;
    expect(huge.fontSize).toBe(72);
    expect(tiny.fontSize).toBe(12);
  });
  it("tracés : pas de redimensionnement par poignée", () => {
    const s = stroke();
    expect(resizeElement(s, "se", 10, 10, limits)).toBe(s);
  });
});

describe("rotation et molette", () => {
  it("rotation 3D : 0,012 rad par pixel", () => {
    const rotated = rotateShape3D(shape3d(), 100, 50);
    expect(rotated.rotationY).toBeCloseTo(1.2);
    expect(rotated.rotationX).toBeCloseTo(-0.6);
  });
  it("molette : ×1,1 autour du centre", () => {
    const grown = scaleElement(shape(), 1.1, limits) as ShapeElement;
    expect(grown.width).toBeCloseTo(110);
    expect(grown.x + grown.width / 2).toBeCloseTo(150);
  });
  it("molette : ×0,9 bornée à la taille minimale", () => {
    const small = scaleElement(shape({ width: 21, height: 21 }), 0.9, limits) as ShapeElement;
    expect(small.width).toBe(20);
  });
  it("molette : texte, ligne et tracé", () => {
    expect((scaleElement(text(), 1.1, limits) as TextElement).fontSize).toBeCloseTo(26.4);
    const l = scaleElement(line(), 0.5, limits) as LineElement;
    expect(l.start.x).toBe(140);
    expect(l.end.x).toBe(220);
    const short = line({ end: { x: 120, y: 200 } });
    expect(scaleElement(short, 0.9, limits)).toBe(short);
    const s = scaleElement(stroke(), 2, limits) as StrokeElement;
    expect(s.points[0]).toEqual({ x: -10, y: -10 });
  });
  it("clampToward ne borne que dans le sens de la variation", () => {
    expect(clampToward(90, 80, 12, 72)).toBe(80);
    expect(clampToward(60, 50, 12, 72)).toBe(60);
    expect(clampToward(5, 10, 12, 72)).toBe(10);
  });
});
