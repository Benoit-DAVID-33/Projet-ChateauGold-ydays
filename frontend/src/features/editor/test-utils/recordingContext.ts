/**
 * Contexte 2D d'enregistrement pour les tests (jsdom n'a pas de canvas) :
 * chaque appel est mémorisé avec l'état de dessin courant (styles, alpha,
 * mode de composition), save/restore compris.
 */
import type { Ctx2D } from "../render/context";

export interface DrawState {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineDash: number[];
}

export interface RecordedCall {
  method: string;
  args: unknown[];
  state: DrawState;
}

export interface FakeGradient {
  args: number[];
  stops: [number, string][];
  addColorStop(offset: number, color: string): void;
}

const INITIAL: DrawState = {
  fillStyle: "#000000",
  strokeStyle: "#000000",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  lineDash: [],
};

const PROPS = [
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "globalAlpha",
  "globalCompositeOperation",
  "font",
  "textAlign",
  "textBaseline",
] as const;

const METHODS = [
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "quadraticCurveTo",
  "arc",
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "fillText",
  "strokeText",
  "clearRect",
  "setTransform",
  "drawImage",
] as const;

export function createRecordingContext() {
  const calls: RecordedCall[] = [];
  const gradients: FakeGradient[] = [];
  const stack: DrawState[] = [];
  let state: DrawState = { ...INITIAL, lineDash: [] };
  const log = (method: string, args: unknown[]) =>
    calls.push({ method, args, state: { ...state, lineDash: [...state.lineDash] } });

  const ctx: Record<string, unknown> = {
    save: () => {
      stack.push({ ...state, lineDash: [...state.lineDash] });
      log("save", []);
    },
    restore: () => {
      state = stack.pop() ?? state;
      log("restore", []);
    },
    setLineDash: (dash: number[]) => {
      state.lineDash = [...dash];
      log("setLineDash", [dash]);
    },
    measureText: (text: string) => ({ width: text.length * 10 }),
    createRadialGradient: (...args: number[]) => {
      const gradient: FakeGradient = {
        args,
        stops: [],
        addColorStop(offset, color) {
          gradient.stops.push([offset, color]);
        },
      };
      gradients.push(gradient);
      log("createRadialGradient", args);
      return gradient;
    },
  };
  for (const method of METHODS) ctx[method] = (...args: unknown[]) => log(method, args);
  for (const prop of PROPS) {
    Object.defineProperty(ctx, prop, {
      get: () => state[prop],
      set: (value: never) => {
        state = { ...state, [prop]: value };
      },
    });
  }

  return {
    ctx: ctx as unknown as Ctx2D & CanvasRenderingContext2D,
    calls,
    gradients,
    callsOf: (method: string) => calls.filter((c) => c.method === method),
    methods: () => calls.map((c) => c.method),
  };
}
