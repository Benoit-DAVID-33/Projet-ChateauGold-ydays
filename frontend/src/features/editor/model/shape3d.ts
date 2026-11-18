/**
 * Mathématiques des objets « 3D » d'origine : projection orthographique,
 * rotation Y puis X, axe Y vers le haut, tri des faces par profondeur.
 */
import { boundsOfPoints, type Rect } from "./geometry";
import type { Point, Shape3DElement } from "./types";

export interface Projected {
  sx: number;
  sy: number;
  z: number;
}

/** Facteur d'échelle : min(w, h) / 4 pour l'hexagone 3D, / 2,5 sinon. */
export function shape3dScale(el: Shape3DElement): number {
  return Math.min(el.width, el.height) / (el.shape === "hexagon3d" ? 4 : 2.5);
}

/** Projette un point du repère normalisé (−1..1) dans le repère natif du média. */
export function createProjector(
  el: Shape3DElement,
): (x: number, y: number, z: number) => Projected {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const scale = shape3dScale(el);
  const cosY = Math.cos(el.rotationY);
  const sinY = Math.sin(el.rotationY);
  const cosX = Math.cos(el.rotationX);
  const sinX = Math.sin(el.rotationX);
  return (x, y, z) => {
    // rotateY puis rotateX (ordre d'origine)
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    return { sx: cx + scale * x1, sy: cy - scale * y2, z: z2 };
  };
}

/** Faces du cube (indices = 4·[z=1] + 2·[y=1] + [x=1]) et opacités par rang de tri. */
export const CUBE_FACES: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 3, 2],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 3, 7, 5],
];
export const CUBE_SHADES = [0.25, 0.35, 0.4, 0.45, 0.5, 0.55] as const;

export interface CubeFace {
  points: Projected[];
  depth: number;
  alpha: number;
}

/** Faces projetées, triées de la plus lointaine à la plus proche (algorithme du peintre). */
export function cubeFaces(el: Shape3DElement): CubeFace[] {
  const project = createProjector(el);
  const vertices: Projected[] = [];
  for (let iz = -1; iz <= 1; iz += 2)
    for (let iy = -1; iy <= 1; iy += 2)
      for (let ix = -1; ix <= 1; ix += 2) vertices.push(project(ix, iy, iz));
  return CUBE_FACES.map((indices) => {
    const points = indices.map((i) => vertices[i]!);
    return { points, depth: points.reduce((sum, p) => sum + p.z, 0) / 4, alpha: 0 };
  })
    .sort((a, b) => a.depth - b.depth)
    .map((face, rank) => ({ ...face, alpha: CUBE_SHADES[rank] ?? 0.5 }));
}

export interface HexPrism {
  back: Projected[];
  front: Projected[];
  /** Vrai si la face arrière est plus lointaine (dessinée en premier). */
  backFirst: boolean;
}

/** Prisme hexagonal : sommets (π/3)·i − π/6, faces à z = ±0,6. */
export function hexPrism(el: Shape3DElement): HexPrism {
  const project = createProjector(el);
  const back: Projected[] = [];
  const front: Projected[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    back.push(project(Math.cos(a), Math.sin(a), -0.6));
    front.push(project(Math.cos(a), Math.sin(a), 0.6));
  }
  const avgZ = (pts: Projected[]) => (pts[0]!.z + pts[1]!.z + pts[2]!.z) / 3;
  return { back, front, backFirst: avgZ(back) < avgZ(front) };
}

export interface RadialGradientSpec {
  x0: number;
  y0: number;
  r0: number;
  x1: number;
  y1: number;
  r1: number;
}

export interface SphereGeometry {
  cx: number;
  cy: number;
  r: number;
  highlight: RadialGradientSpec;
  shadow: RadialGradientSpec;
}

/** Bille : reflet et ombre déplacés selon la rotation (formules d'origine). */
export function sphereGeometry(el: Shape3DElement): SphereGeometry {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r = Math.min(el.width, el.height) / 2;
  const gx = cx + r * 0.6 * Math.sin(el.rotationY);
  const gy = cy - r * 0.6 * Math.sin(el.rotationX);
  const sx = cx - r * 0.5 * Math.sin(el.rotationY);
  const sy = cy + r * 0.5 * Math.sin(el.rotationX);
  return {
    cx,
    cy,
    r,
    highlight: { x0: gx - r * 0.4, y0: gy - r * 0.4, r0: 0, x1: cx, y1: cy, r1: r * 1.1 },
    shadow: { x0: sx, y0: sy, r0: 0, x1: cx, y1: cy, r1: r * 1.2 },
  };
}

/** Emprise réellement dessinée (un cube tourné peut déborder de son rectangle). */
export function shape3dDrawnBounds(el: Shape3DElement): Rect {
  if (el.shape === "sphere") {
    const r = Math.min(el.width, el.height) / 2;
    return { x: el.x + el.width / 2 - r, y: el.y + el.height / 2 - r, width: 2 * r, height: 2 * r };
  }
  const pts: Projected[] =
    el.shape === "cube"
      ? cubeFaces(el).flatMap((f) => f.points)
      : (({ back, front }) => [...back, ...front])(hexPrism(el));
  return boundsOfPoints(pts.map((p): Point => ({ x: p.sx, y: p.sy })));
}
