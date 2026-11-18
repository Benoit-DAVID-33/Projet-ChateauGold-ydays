/**
 * Modèle des annotations — CONTRAT partagé entre l'éditeur (dessin, export)
 * et l'Assistant IA (génération de prompts).
 *
 * Règle d'or : toutes les coordonnées et dimensions sont exprimées en PIXELS
 * NATIFS DU MÉDIA (naturalWidth/videoWidth), jamais en pixels d'affichage.
 * L'affichage (zoom, redimensionnement de fenêtre) applique une simple mise à
 * l'échelle ; les exports et les pourcentages envoyés à l'IA sont donc exacts.
 * (Corrige les dérives de position de la version d'origine.)
 */

export type ShapeKind =
  "square" | "rounded-square" | "circle" | "triangle" | "triangle-inverted" | "diamond" | "hexagon";

export type Shape3DKind = "cube" | "sphere" | "hexagon3d";

export type LineKind = "straight-arrow" | "curved" | "zigzag";

export type StrokeTool = "marker" | "eraser" | "pencil";

export interface Point {
  x: number;
  y: number;
}

interface ElementBase {
  id: string;
  /** Couleur principale (hex). */
  color: string;
  /** Épaisseur de trait en pixels natifs. */
  strokeWidth: number;
  /**
   * Fenêtre temporelle (vidéo uniquement), en secondes : l'élément est visible
   * pour startTime <= t < endTime. endTime null = jusqu'à la fin.
   * Pour une image : startTime = 0 et endTime = null.
   */
  startTime: number;
  endTime: number | null;
  /** Indicateur « Motion Tracking » transmis à l'IA (pas de suivi automatique). */
  motionTracking: boolean;
}

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: ShapeKind;
  x: number; // coin haut-gauche
  y: number;
  width: number;
  height: number;
}

export interface Shape3DElement extends ElementBase {
  type: "shape3d";
  shape: Shape3DKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotations en radians (rotation interactive Maj/Alt + glisser). */
  rotationX: number;
  rotationY: number;
}

export interface LineElement extends ElementBase {
  type: "line";
  line: LineKind;
  start: Point;
  end: Point;
}

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  x: number; // ligne de base gauche
  y: number;
  fontSize: number; // pixels natifs
}

export interface StrokeElement extends ElementBase {
  type: "stroke";
  tool: StrokeTool;
  points: Point[];
}

export type AnnotationElement =
  ShapeElement | Shape3DElement | LineElement | TextElement | StrokeElement;

export interface MediaInfo {
  kind: "image" | "video";
  name: string;
  /** Dimensions natives du média (repère des coordonnées). */
  width: number;
  height: number;
  /** Durée en secondes (vidéo). */
  duration?: number;
}

/** Visible à l'instant t (en secondes) ? Pour une image, t = 0. */
export function isVisibleAt(element: AnnotationElement, t: number): boolean {
  return t >= element.startTime && (element.endTime === null || t < element.endTime);
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  square: "Carré",
  "rounded-square": "Carré arrondi",
  circle: "Rond",
  triangle: "Triangle",
  "triangle-inverted": "Triangle inversé",
  diamond: "Losange",
  hexagon: "Hexagone",
};

export const SHAPE3D_LABELS: Record<Shape3DKind, string> = {
  cube: "Cube",
  sphere: "Bille",
  hexagon3d: "Hexagone 3D",
};

export const LINE_LABELS: Record<LineKind, string> = {
  "straight-arrow": "Flèche",
  curved: "Courbe",
  zigzag: "Ligne torsadée",
};

export const DEFAULT_COLOR = "#FFD700";

/** Palette de dessin (19 teintes, ordre exact de la version d'origine). */
export const PALETTE = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FFD700",
  "#FFA500",
  "#800080",
  "#FFC0CB",
  "#A52A2A",
  "#808080",
  "#008000",
  "#000080",
  "#800000",
  "#C0C0C0",
  "#FF6347",
] as const;
