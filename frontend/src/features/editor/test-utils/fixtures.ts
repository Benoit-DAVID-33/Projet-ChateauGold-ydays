/** Fabriques d'éléments pour les tests (valeurs explicites, sans aléa). */
import type {
  LineElement,
  Shape3DElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from "../model/types";

const base = {
  color: "#FFD700",
  strokeWidth: 3,
  startTime: 0,
  endTime: null,
  motionTracking: false,
};

export const shape = (over: Partial<ShapeElement> = {}): ShapeElement => ({
  ...base,
  id: "shape_1",
  type: "shape",
  shape: "square",
  x: 100,
  y: 100,
  width: 100,
  height: 100,
  ...over,
});

export const shape3d = (over: Partial<Shape3DElement> = {}): Shape3DElement => ({
  ...base,
  strokeWidth: 2,
  id: "shape3d_1",
  type: "shape3d",
  shape: "cube",
  x: 100,
  y: 100,
  width: 80,
  height: 80,
  rotationX: 0,
  rotationY: 0,
  ...over,
});

export const line = (over: Partial<LineElement> = {}): LineElement => ({
  ...base,
  id: "line_1",
  type: "line",
  line: "straight-arrow",
  start: { x: 100, y: 200 },
  end: { x: 260, y: 200 },
  ...over,
});

export const text = (over: Partial<TextElement> = {}): TextElement => ({
  ...base,
  strokeWidth: 2,
  id: "text_1",
  type: "text",
  text: "Bonjour",
  x: 50,
  y: 74, // ligne de base : boîte [y − 19,2 ; y + 4,8] à 24 px
  fontSize: 24,
  ...over,
});

export const stroke = (over: Partial<StrokeElement> = {}): StrokeElement => ({
  ...base,
  strokeWidth: 5,
  id: "stroke_1",
  type: "stroke",
  tool: "pencil",
  points: [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 50, y: 50 },
  ],
  ...over,
});
