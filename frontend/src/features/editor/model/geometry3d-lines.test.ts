import { describe, expect, it } from "vitest";

import { line, shape3d } from "../test-utils/fixtures";
import { arrowHead, curveControlPoint, linePolyline, zigzagPoints } from "./lines";
import { CUBE_SHADES, createProjector, cubeFaces, hexPrism, sphereGeometry } from "./shape3d";
import { hexagonPoints, shapePolygon } from "./shapes";

describe("lignes (formules d'origine)", () => {
  it("tête de flèche : longueur 15, demi-angle π/6", () => {
    const [tip, a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 15);
    expect(tip).toEqual({ x: 100, y: 0 });
    expect(a.x).toBeCloseTo(100 - 15 * Math.cos(Math.PI / 6));
    expect(a.y).toBeCloseTo(7.5);
    expect(b.y).toBeCloseTo(-7.5);
  });
  it("courbe : contrôle = milieu + 0,3 × (dy, −dx)", () => {
    expect(curveControlPoint({ x: 100, y: 200 }, { x: 260, y: 200 })).toEqual({ x: 180, y: 152 });
  });
  it("zigzag : max(3, floor(d/20)) segments alternés de plus ou moins 10", () => {
    const pts = zigzagPoints({ x: 0, y: 0 }, { x: 160, y: 0 }, 10, 20);
    expect(pts).toHaveLength(9);
    expect(pts[1]).toEqual({ x: 20, y: -10 });
    expect(pts[2]).toEqual({ x: 40, y: 10 });
    expect(zigzagPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 10, 20)).toHaveLength(4);
  });
  it("zigzag de longueur nulle : aucun NaN (bug d'origine)", () => {
    const pts = zigzagPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, 20);
    expect(pts).toEqual([{ x: 5, y: 5 }]);
  });
  it("polyligne de hit-test selon le type", () => {
    expect(linePolyline(line())).toHaveLength(2);
    expect(linePolyline(line({ line: "curved" })).length).toBeGreaterThan(10);
    // épaisseur 3 : pas 20, amplitude 10 (valeurs d'origine)
    expect(linePolyline(line({ line: "zigzag" }))).toHaveLength(9);
  });
});

describe("formes 2D", () => {
  it("hexagone : sommets gauche/droite pointus, rayon min(w, h)/2", () => {
    const pts = hexagonPoints({ x: 0, y: 0, width: 100, height: 60 });
    expect(pts[0]).toEqual({ x: 80, y: 30 });
    expect(pts[3]!.x).toBeCloseTo(20);
  });
  it("triangle inversé : pointe en bas", () => {
    expect(shapePolygon("triangle-inverted", { x: 0, y: 0, width: 10, height: 10 })?.[0]).toEqual({
      x: 5,
      y: 10,
    });
    expect(shapePolygon("circle", { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe("objets 3D (mathématiques d'origine)", () => {
  it("projection orthographique, axe Y vers le haut, échelle min/2,5", () => {
    const project = createProjector(shape3d());
    expect(project(1, 1, 0)).toEqual({ sx: 172, sy: 108, z: 0 });
  });
  it("cube : 6 faces triées par profondeur, opacités par rang", () => {
    const faces = cubeFaces(shape3d({ rotationX: 0.3, rotationY: 0.5 }));
    expect(faces.map((f) => f.alpha)).toEqual([...CUBE_SHADES]);
    const depths = faces.map((f) => f.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });
  it("hexagone 3D : face arrière d'abord au repos, ordre inversé retourné", () => {
    expect(hexPrism(shape3d({ shape: "hexagon3d" })).backFirst).toBe(true);
    expect(hexPrism(shape3d({ shape: "hexagon3d", rotationY: Math.PI })).backFirst).toBe(false);
  });
  it("bille : reflet déplacé par la rotation", () => {
    const rest = sphereGeometry(shape3d({ shape: "sphere" }));
    expect(rest).toMatchObject({ cx: 140, cy: 140, r: 40 });
    expect(rest.highlight).toMatchObject({ x0: 124, y0: 124, r1: 44 });
    const turned = sphereGeometry(shape3d({ shape: "sphere", rotationY: Math.PI / 2 }));
    expect(turned.highlight.x0).toBeCloseTo(124 + 24);
    expect(turned.shadow.x0).toBeCloseTo(140 - 20);
  });
});
