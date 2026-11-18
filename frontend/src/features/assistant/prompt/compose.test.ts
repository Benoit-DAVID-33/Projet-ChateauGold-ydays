import { describe, expect, it } from "vitest";

import { IMAGE, VIDEO, line, shape, shape3d, stroke, text } from "../test/factories";
import { composePrompt, countCharacters, PROMPT_MAX_LENGTH } from "./compose";
import { renderCompactSummary } from "./describe";
import { buildFullPrompt } from "./fullPrompt";
import { buildSendPrompt } from "./sendPrompt";
import type { ElementsSummary } from "./types";

const ELEMENTS = [shape(), text({ startTime: 1, endTime: 4 }), line()];

describe("composePrompt", () => {
  it("envoie buildSendPrompt quand les annotations sont incluses et visibles", () => {
    const result = composePrompt({
      intent: "  Ajouter une lueur ",
      includeAnnotations: true,
      elements: ELEMENTS,
      mediaInfo: VIDEO,
    });
    expect(result.prompt).toBe(buildSendPrompt("Ajouter une lueur", ELEMENTS, VIDEO));
    expect(result.fullPrompt).toBe(buildFullPrompt(ELEMENTS, "Ajouter une lueur", VIDEO));
    expect(result).toMatchObject({
      summary: "3 éléments : 1 forme, 1 texte, 1 ligne",
      ignored: 0,
      annotationCount: 3,
      annotationsIncluded: true,
      length: countCharacters(result.prompt),
      tooLong: false,
    });
  });

  it("envoie l'intention rognée seule quand les annotations sont exclues", () => {
    const result = composePrompt({
      intent: "  Ajouter une lueur ",
      includeAnnotations: false,
      elements: ELEMENTS,
      mediaInfo: VIDEO,
    });
    expect(result.prompt).toBe("Ajouter une lueur");
    expect(result.fullPrompt).toBe(buildFullPrompt([], "Ajouter une lueur", VIDEO));
    expect(result.fullPrompt).toContain("No elements defined for this task.");
    // Le résumé décrit toujours les annotations présentes.
    expect(result).toMatchObject({
      annotationCount: 3,
      annotationsIncluded: false,
      summary: "3 éléments : 1 forme, 1 texte, 1 ligne",
      length: 17,
    });
  });

  it("envoie l'intention seule quand aucune annotation n'est visible", () => {
    const result = composePrompt({
      intent: "Lueur",
      includeAnnotations: true,
      elements: [shape({ startTime: 3, endTime: 3 }), text({ text: " " })],
      mediaInfo: VIDEO,
    });
    expect(result).toMatchObject({
      prompt: "Lueur",
      annotationCount: 0,
      annotationsIncluded: false,
      ignored: 2,
      summary: "Aucune annotation visible (2 ignorés, jamais visibles)",
    });
  });

  it("accepte un média absent (image 1280×720)", () => {
    const result = composePrompt({
      intent: "x",
      includeAnnotations: true,
      elements: [shape()],
      mediaInfo: null,
    });
    expect(result.prompt).toContain("(Repère : image 1280×720 px");
  });

  it("signale un prompt envoyé au-delà de 2500 caractères", () => {
    const atLimit = composePrompt({
      intent: "a".repeat(PROMPT_MAX_LENGTH),
      includeAnnotations: false,
      elements: [],
      mediaInfo: IMAGE,
    });
    expect(atLimit).toMatchObject({ length: 2500, tooLong: false });

    const over = composePrompt({
      intent: "a".repeat(PROMPT_MAX_LENGTH + 1),
      includeAnnotations: false,
      elements: [],
      mediaInfo: IMAGE,
    });
    expect(over).toMatchObject({ length: 2501, tooLong: true });
  });

  it("compte les annotations dans la limite", () => {
    const input = {
      intent: "a".repeat(2400),
      elements: ELEMENTS,
      mediaInfo: VIDEO,
    };
    expect(composePrompt({ ...input, includeAnnotations: true }).tooLong).toBe(true);
    expect(composePrompt({ ...input, includeAnnotations: false }).tooLong).toBe(false);
  });

  it("compte les caractères comme le backend (points de code)", () => {
    const clef = "\u{1D11E}"; // une seule lettre, deux unités UTF-16
    expect(clef.length).toBe(2);
    expect(countCharacters(clef)).toBe(1);
    const result = composePrompt({
      intent: clef.repeat(PROMPT_MAX_LENGTH),
      includeAnnotations: false,
      elements: [],
      mediaInfo: IMAGE,
    });
    expect(result).toMatchObject({ length: 2500, tooLong: false });
  });
});

describe("renderCompactSummary", () => {
  const zero: ElementsSummary = {
    totalElements: 0,
    shapes: 0,
    shape3d: 0,
    texts: 0,
    lines: 0,
    strokes: 0,
    ignored: 0,
  };

  it("indique l'absence d'annotation", () => {
    expect(renderCompactSummary(zero)).toBe("Aucune annotation");
  });

  it("accorde au singulier et au pluriel", () => {
    expect(renderCompactSummary({ ...zero, totalElements: 1, shapes: 1 })).toBe(
      "1 élément : 1 forme",
    );
    expect(
      renderCompactSummary({
        totalElements: 10,
        shapes: 2,
        shape3d: 2,
        texts: 2,
        lines: 2,
        strokes: 2,
        ignored: 1,
      }),
    ).toBe(
      "10 éléments : 2 formes, 2 objets 3D, 2 textes, 2 lignes, 2 tracés (1 ignoré, jamais visible)",
    );
  });

  it("résume tous les types à partir des éléments", () => {
    const { summary } = composePrompt({
      intent: "",
      includeAnnotations: true,
      elements: [shape3d(), stroke()],
      mediaInfo: IMAGE,
    });
    expect(summary).toBe("2 éléments : 1 objet 3D, 1 tracé");
  });
});
