/** Fabriques d'éléments pour les tests de l'Assistant IA. */
import type {
  LineElement,
  MediaInfo,
  Shape3DElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from "@/features/editor/model/types";

const common = {
  color: "#FFD700",
  strokeWidth: 3,
  startTime: 0,
  endTime: null,
  motionTracking: false,
} as const;

/** Image carrée 1000×1000 : 1 px = 0,1 %. */
export const IMAGE: MediaInfo = { kind: "image", name: "photo.png", width: 1000, height: 1000 };

/** Vidéo 1920×1080 de 10 s. */
export const VIDEO: MediaInfo = {
  kind: "video",
  name: "clip.mp4",
  width: 1920,
  height: 1080,
  duration: 10,
};

export function shape(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    ...common,
    id: "shape_1",
    type: "shape",
    shape: "circle",
    x: 450,
    y: 450,
    width: 100,
    height: 100,
    ...overrides,
  };
}

export function shape3d(overrides: Partial<Shape3DElement> = {}): Shape3DElement {
  return {
    ...common,
    id: "shape3d_1",
    type: "shape3d",
    shape: "cube",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    rotationX: 0.5236,
    rotationY: -0.1,
    ...overrides,
  };
}

export function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    ...common,
    id: "text_1",
    type: "text",
    text: "Bonjour",
    x: 100,
    y: 900,
    fontSize: 40,
    ...overrides,
  };
}

export function line(overrides: Partial<LineElement> = {}): LineElement {
  return {
    ...common,
    id: "line_1",
    type: "line",
    line: "straight-arrow",
    start: { x: 100, y: 100 },
    end: { x: 900, y: 500 },
    ...overrides,
  };
}

export function stroke(overrides: Partial<StrokeElement> = {}): StrokeElement {
  return {
    ...common,
    id: "stroke_1",
    type: "stroke",
    tool: "marker",
    points: [
      { x: 100, y: 200 },
      { x: 300, y: 250 },
      { x: 200, y: 400 },
    ],
    ...overrides,
  };
}
