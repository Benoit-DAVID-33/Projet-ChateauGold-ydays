import { describe, expect, it } from "vitest";

import { line, shape, stroke, text } from "../test-utils/fixtures";
import { elementLabel, formatSeconds, formatTick, timeWindowLabel } from "./labels";
import { moveInStack } from "./order";
import {
  deleteElementAt,
  normalizeWindow,
  retimeEdge,
  rulerStep,
  shiftWindow,
  timeAtClientX,
} from "./timing";

describe("libellés", () => {
  it("type d'élément en français", () => {
    expect(elementLabel(shape({ shape: "triangle-inverted" }))).toBe("Triangle inversé");
    expect(elementLabel(line({ line: "zigzag" }))).toBe("Ligne torsadée");
    expect(elementLabel(stroke({ tool: "marker" }))).toBe("Feutre");
    expect(elementLabel(text({ text: "Bonjour" }))).toBe("Texte « Bonjour »");
    const long = elementLabel(text({ text: "x".repeat(40) }));
    expect(long).toHaveLength(34);
    expect(long.endsWith("x\u2026 \u00bb")).toBe(true);
  });
  it("fenêtre temporelle", () => {
    expect(formatSeconds(2)).toBe("2,0 s");
    expect(timeWindowLabel({ startTime: 2, endTime: 5.25 })).toBe("2,0 s à 5,3 s");
    expect(timeWindowLabel({ startTime: 0, endTime: null })).toBe("0,0 s jusqu'à la fin");
  });
  it("graduations", () => {
    expect(formatTick(0.5)).toBe("0,5 s");
    expect(formatTick(90)).toBe("1 min 30");
    expect(formatTick(120)).toBe("2 min");
    expect(rulerStep(4)).toBe(0.5);
    expect(rulerStep(12.5)).toBe(2);
    expect(rulerStep(600)).toBe(60);
  });
});

describe("fenêtres temporelles", () => {
  const base = { startTime: 2, endTime: 5 };
  it("bord de début borné par la fin moins 0,1 s et par 0", () => {
    expect(retimeEdge(base, "start", 1, 10)).toEqual({ startTime: 1, endTime: 5 });
    expect(retimeEdge(base, "start", 9, 10).startTime).toBeCloseTo(4.9);
    expect(retimeEdge(base, "start", -3, 10).startTime).toBe(0);
  });
  it("bord de fin : borné, et « jusqu'à la fin » au bout de la vidéo", () => {
    expect(retimeEdge(base, "end", 7, 10)).toEqual({ startTime: 2, endTime: 7 });
    expect(retimeEdge(base, "end", 0, 10).endTime).toBeCloseTo(2.1);
    expect(retimeEdge(base, "end", 50, 10).endTime).toBeNull();
  });
  it("décalage de toute la fenêtre sans changer sa longueur", () => {
    expect(shiftWindow(base, 1.5, 10)).toEqual({ startTime: 3.5, endTime: 6.5 });
    expect(shiftWindow(base, -9, 10)).toEqual({ startTime: 0, endTime: 3 });
    expect(shiftWindow(base, 20, 10)).toEqual({ startTime: 7, endTime: null });
    expect(shiftWindow({ startTime: 4, endTime: null }, -1, 10)).toEqual({
      startTime: 3,
      endTime: 9,
    });
  });
  it("normalisation", () => {
    expect(normalizeWindow({ startTime: -1, endTime: 20 }, 10)).toEqual({
      startTime: 0,
      endTime: null,
    });
    expect(normalizeWindow({ startTime: 6, endTime: 3 }, 10).endTime).toBeCloseTo(6.1);
  });
  it("position écran vers temps", () => {
    expect(timeAtClientX(150, { left: 100, width: 200 }, 8)).toBe(2);
    expect(timeAtClientX(0, { left: 100, width: 200 }, 8)).toBe(0);
    expect(timeAtClientX(5, { left: 0, width: 0 }, 8)).toBe(0);
  });
  it("suppression vidéo d'un élément déjà terminé : retrait (sans prolonger la fenêtre)", () => {
    const ended = shape({ startTime: 1, endTime: 3 });
    expect(deleteElementAt([ended], ended.id, "video", 7)).toEqual([]);
  });
});

describe("ordre d'empilement", () => {
  const a = shape({ id: "a" });
  const b = shape({ id: "b" });
  const c = shape({ id: "c" });
  it("avance et recule d'un cran", () => {
    expect(moveInStack([a, b, c], "a", 1).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(moveInStack([a, b, c], "c", -1).map((e) => e.id)).toEqual(["a", "c", "b"]);
  });
  it("renvoie le même tableau aux extrémités", () => {
    const list = [a, b, c];
    expect(moveInStack(list, "c", 1)).toBe(list);
    expect(moveInStack(list, "a", -1)).toBe(list);
    expect(moveInStack(list, "zzz", 1)).toBe(list);
  });
});
