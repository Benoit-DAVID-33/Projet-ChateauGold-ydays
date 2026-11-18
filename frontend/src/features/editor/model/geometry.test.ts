import { describe, expect, it } from "vitest";

import {
  boundsOfPoints,
  distanceToPolyline,
  distanceToSegment,
  pointInPolygon,
  rectContains,
  unionRect,
} from "./geometry";

describe("distanceToSegment", () => {
  it("mesure la distance perpendiculaire à l'intérieur du segment", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
  it("borne la projection aux extrémités", () => {
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
  it("gère un segment de longueur nulle sans NaN", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("distanceToPolyline", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it("ne ferme pas une polyligne ouverte", () => {
    expect(distanceToPolyline({ x: -2, y: 5 }, square)).toBeCloseTo(Math.hypot(2, 5));
  });
  it("ferme le polygone si demandé", () => {
    expect(distanceToPolyline({ x: -2, y: 5 }, square, true)).toBe(2);
  });
  it("renvoie Infinity pour une liste vide", () => {
    expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity);
  });
});

describe("pointInPolygon / rectangles", () => {
  const triangle = [
    { x: 50, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
  ];
  it("détecte l'intérieur et l'extérieur d'un triangle", () => {
    expect(pointInPolygon({ x: 50, y: 60 }, triangle)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, triangle)).toBe(false);
  });
  it("calcule emprises et unions", () => {
    expect(
      boundsOfPoints([
        { x: 3, y: 9 },
        { x: -1, y: 2 },
      ]),
    ).toEqual({
      x: -1,
      y: 2,
      width: 4,
      height: 7,
    });
    expect(
      unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: -5, width: 10, height: 5 }),
    ).toEqual({ x: 0, y: -5, width: 15, height: 15 });
    expect(rectContains({ x: 0, y: 0, width: 10, height: 10 }, { x: 12, y: 5 }, 2)).toBe(true);
  });
});
