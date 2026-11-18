import { describe, expect, it } from "vitest";

import { shape } from "../test-utils/fixtures";
import {
  createLine,
  createShape,
  createShape3D,
  createStroke,
  createText,
  type CreationContext,
} from "./factory";
import { deleteElementAt, visibleElements } from "./timing";
import { isVisibleAt } from "./types";

const ctx: CreationContext = {
  center: { x: 960, y: 540 },
  unitsPerPx: 2, // média 1920 px affiché sur 960 px
  color: "#FF0000",
  time: 3.5,
};

describe("création (tailles d'origine converties en pixels natifs)", () => {
  it("forme : 100 px écran centrée, trait 3 px", () => {
    const el = createShape("hexagon", ctx);
    expect(el).toMatchObject({
      type: "shape",
      shape: "hexagon",
      x: 860,
      y: 440,
      width: 200,
      height: 200,
      strokeWidth: 6,
      color: "#FF0000",
      startTime: 3.5,
      endTime: null,
      motionTracking: false,
    });
    expect(el.id).toMatch(/^shape_\d+_[a-z0-9]+$/);
  });
  it("objets 3D : 80 px (70 px pour l'hexagone 3D), rotation nulle", () => {
    expect(createShape3D("cube", ctx)).toMatchObject({ width: 160, rotationX: 0, rotationY: 0 });
    expect(createShape3D("hexagon3d", ctx)).toMatchObject({ width: 140, height: 140 });
    expect(createShape3D("sphere", ctx).id).toMatch(/^shape3d_/);
  });
  it("ligne : horizontale de 160 px écran centrée", () => {
    const el = createLine("zigzag", ctx);
    expect(el.start).toEqual({ x: 800, y: 540 });
    expect(el.end).toEqual({ x: 1120, y: 540 });
    expect(el.id).toMatch(/^line_/);
  });
  it("texte : coin haut-gauche au clic, (x, y) = ligne de base, id unique", () => {
    const el = createText("Salut", { x: 10, y: 20 }, 24, ctx);
    expect(el.fontSize).toBe(48);
    expect(el.x).toBe(10);
    expect(el.y).toBeCloseTo(20 + 0.8 * 48);
    expect(el.id).toMatch(/^text_\d+_[a-z0-9]+$/);
  });
  it("tracé : épaisseur du curseur convertie", () => {
    const el = createStroke("marker", { x: 1, y: 2 }, 5, ctx);
    expect(el).toMatchObject({ tool: "marker", strokeWidth: 10, points: [{ x: 1, y: 2 }] });
  });
});

describe("temporalité", () => {
  it("isVisibleAt : startTime inclus, endTime exclu", () => {
    const el = shape({ startTime: 2, endTime: 5 });
    expect(isVisibleAt(el, 1.99)).toBe(false);
    expect(isVisibleAt(el, 2)).toBe(true);
    expect(isVisibleAt(el, 4.99)).toBe(true);
    expect(isVisibleAt(el, 5)).toBe(false);
    expect(visibleElements([el, shape({ id: "b" })], 6).map((e) => e.id)).toEqual(["b"]);
  });
  it("suppression image : retrait définitif", () => {
    expect(deleteElementAt([shape()], "shape_1", "image", 0)).toEqual([]);
  });
  it("suppression vidéo : fin de vie au temps courant", () => {
    const [el] = deleteElementAt([shape({ startTime: 1 })], "shape_1", "video", 4);
    expect(el?.endTime).toBe(4);
  });
  it("suppression vidéo à t inférieur ou égal à startTime : retrait définitif", () => {
    expect(deleteElementAt([shape({ startTime: 4 })], "shape_1", "video", 4)).toEqual([]);
  });
});
