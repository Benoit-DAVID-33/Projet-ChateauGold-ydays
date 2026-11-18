import { afterEach, describe, expect, it, vi } from "vitest";

import { IMAGE, VIDEO, line, shape, shape3d, stroke, text } from "../test/factories";
import { describeElements } from "./describe";
import { buildFullPrompt } from "./fullPrompt";
import { buildSendPrompt } from "./sendPrompt";
import {
  buildStructuredExport,
  serializeStructuredExport,
  STRUCTURED_EXPORT_VERSION,
  structuredExportFilename,
} from "./structuredExport";

const exportedAt = new Date("2026-10-30T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("buildStructuredExport", () => {
  it("produit un objet versionné, cohérent avec les deux prompts", () => {
    const elements = [shape(), text({ startTime: 1, endTime: 3 })];
    const data = buildStructuredExport(elements, "  Lueur ", VIDEO, { exportedAt });
    expect(data).toMatchObject({
      version: STRUCTURED_EXPORT_VERSION,
      generator: "GOLD FX — Assistant IA",
      exportedAt: "2026-10-30T12:00:00.000Z",
      mediaInfo: { kind: "video", name: "clip.mp4", width: 1920, height: 1080, duration: 10 },
      userIntent: "Lueur",
      summary: {
        totalElements: 2,
        shapes: 1,
        shape3d: 0,
        texts: 1,
        lines: 0,
        strokes: 0,
        ignored: 0,
      },
    });
    expect(data.version).toBe(2);
    expect(data.description).toBe(describeElements(elements, VIDEO).description);
    expect(data.prompts).toEqual({
      send: buildSendPrompt("Lueur", elements, VIDEO),
      full: buildFullPrompt(elements, "Lueur", VIDEO),
    });
  });

  it("date l'export à l'instant présent par défaut", () => {
    vi.useFakeTimers();
    vi.setSystemTime(exportedAt);
    expect(buildStructuredExport([], "", null).exportedAt).toBe("2026-10-30T12:00:00.000Z");
  });

  it("décrit chaque type d'élément", () => {
    const { elements } = buildStructuredExport(
      [
        shape({ motionTracking: true }),
        shape3d(),
        text(),
        line({ strokeWidth: 4 }),
        stroke({ tool: "eraser", startTime: 2 }),
      ],
      "",
      IMAGE,
      { exportedAt },
    );
    const common = { timing: null, motionTracking: false };
    expect(elements).toEqual([
      {
        type: "shape",
        id: "shape_1",
        label: "Rond",
        shapeType: "circle",
        color: "#FFD700",
        colorName: "or",
        position: "Centre",
        positionPercent: { x: 50, y: 50 },
        boundsPercent: { x: 45, y: 45, width: 10, height: 10 },
        timing: null,
        motionTracking: true,
        size: "Petit",
        sizePercent: { width: 10, height: 10 },
        pixelDimensions: { width: 100, height: 100 },
      },
      {
        type: "shape3d",
        id: "shape3d_1",
        label: "Cube",
        shape3dType: "cube",
        color: "#FFD700",
        colorName: "or",
        position: "Haut-Gauche",
        positionPercent: { x: 20, y: 20 },
        boundsPercent: { x: 10, y: 10, width: 20, height: 20 },
        ...common,
        size: "Moyen",
        sizePercent: { width: 20, height: 20 },
        pixelDimensions: { width: 200, height: 200 },
        rotation: { x: 0.5236, y: -0.1 },
      },
      {
        type: "text",
        id: "text_1",
        label: "Texte",
        content: "Bonjour",
        color: "#FFD700",
        colorName: "or",
        position: "Bas-Gauche",
        positionPercent: { x: 18.4, y: 88.8 },
        boundsPercent: { x: 10, y: 86.8, width: 16.8, height: 4 },
        ...common,
        fontSize: 40,
      },
      {
        type: "line",
        id: "line_1",
        label: "Flèche",
        lineType: "straight-arrow",
        color: "#FFD700",
        colorName: "or",
        position: "Haut-Centre",
        positionPercent: { x: 50, y: 30 },
        boundsPercent: { x: 10, y: 10, width: 80, height: 40 },
        ...common,
        startPosition: { x: 10, y: 10 },
        endPosition: { x: 90, y: 50 },
        strokeWidth: 4,
      },
      {
        type: "stroke",
        id: "stroke_1",
        label: "Gomme",
        tool: "eraser",
        color: "#FFD700",
        colorName: "or",
        position: "Haut-Gauche",
        positionPercent: { x: 20, y: 30 },
        boundsPercent: { x: 10, y: 20, width: 20, height: 20 },
        ...common,
        pointCount: 3,
        strokeWidth: 3,
      },
    ]);
  });

  it("inclut la fenêtre temporelle des éléments d'une vidéo", () => {
    const { elements } = buildStructuredExport(
      [shape({ startTime: 2, endTime: 5.3 }), shape({ id: "s2", startTime: 1, endTime: 99 })],
      "",
      VIDEO,
      { exportedAt },
    );
    expect(elements.map((element) => element.timing)).toEqual([
      { startTime: 2, endTime: 5.3 },
      { startTime: 1, endTime: null },
    ]);
  });

  it("aligne les prompts sur la case « Inclure les annotations » sans changer la forme", () => {
    const elements = [shape(), line()];
    const without = buildStructuredExport(elements, " Lueur ", IMAGE, {
      exportedAt,
      includeAnnotations: false,
    });
    const withAnnotations = buildStructuredExport(elements, " Lueur ", IMAGE, { exportedAt });
    expect(without.prompts).toEqual({
      send: "Lueur",
      full: buildFullPrompt([], "Lueur", IMAGE),
    });
    expect(without.version).toBe(withAnnotations.version);
    expect(Object.keys(without)).toEqual(Object.keys(withAnnotations));
    // Les annotations restent exportées comme données.
    expect(without.elements).toEqual(withAnnotations.elements);
    expect(without.description).toBe(withAnnotations.description);
  });

  it("exporte un état vide valide", () => {
    const data = buildStructuredExport([], "", null, { exportedAt });
    expect(data.elements).toEqual([]);
    expect(data.description).toBe("");
    expect(data.prompts.send).toBe("");
    expect(data.prompts.full).toContain("No elements defined for this task.");
  });
});

describe("serializeStructuredExport / structuredExportFilename", () => {
  it("sérialise en JSON indenté de 2 espaces, relisible à l'identique", () => {
    const data = buildStructuredExport([shape()], "Lueur", IMAGE, { exportedAt });
    const json = serializeStructuredExport(data);
    expect(json).toContain('\n  "version": 2,\n');
    expect(JSON.parse(json)).toEqual(data);
  });

  it("reprend le nom de fichier d'origine elements_<timestamp>.json", () => {
    expect(structuredExportFilename(1700000000000)).toBe("elements_1700000000000.json");
    vi.useFakeTimers();
    vi.setSystemTime(exportedAt);
    expect(structuredExportFilename()).toBe(`elements_${exportedAt.getTime()}.json`);
  });
});
