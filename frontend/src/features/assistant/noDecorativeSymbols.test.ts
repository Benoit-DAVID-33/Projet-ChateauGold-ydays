/**
 * Garde-fou : aucun emoji ni symbole décoratif dans ce que l'utilisateur voit
 * ou envoie (prompts transmis à Kling, export JSON, libellés de l'interface).
 * Guillemets « », points de suspension, tirets et « × » restent autorisés.
 */
import { describe, expect, it } from "vitest";

import {
  ASSISTANT_TEXT,
  COMPOSER_TEXT,
  characterCounter,
  includeAnnotationsLabel,
  tooLongWarning,
  viewHint,
} from "./components/texts";
import { composePrompt } from "./prompt/compose";
import { describeElements, summarizeElements } from "./prompt/describe";
import { buildFullPrompt } from "./prompt/fullPrompt";
import { buildSendPrompt } from "./prompt/sendPrompt";
import { buildStructuredExport, serializeStructuredExport } from "./prompt/structuredExport";
import { IMAGE, VIDEO, line, shape, shape3d, stroke, text } from "./test/factories";
import { forbiddenSymbol } from "./test/symbols";

const ALL_KINDS = [
  shape({ motionTracking: true }),
  shape3d(),
  text({ startTime: 1, endTime: 3 }),
  line({ line: "curved" }),
  line({ id: "line_2", line: "zigzag" }),
  stroke(),
  stroke({ id: "stroke_2", tool: "pencil" }),
  stroke({ id: "stroke_3", tool: "eraser" }),
  shape({ id: "deleted", startTime: 2, endTime: 1 }),
];

describe("aucun symbole décoratif", () => {
  it.each([
    ["image", IMAGE],
    ["vidéo", VIDEO],
  ] as const)("dans les prompts et l'export JSON (%s)", (_kind, media) => {
    const outputs = [
      describeElements(ALL_KINDS, media, "Lueur").description,
      summarizeElements(ALL_KINDS, media),
      buildSendPrompt("Lueur", ALL_KINDS, media),
      buildFullPrompt(ALL_KINDS, "Lueur", media),
      buildFullPrompt([], "", media),
      composePrompt({
        intent: "Lueur",
        includeAnnotations: true,
        elements: ALL_KINDS,
        mediaInfo: media,
      }).summary,
      serializeStructuredExport(buildStructuredExport(ALL_KINDS, "Lueur", media)),
    ];
    for (const output of outputs) expect(forbiddenSymbol(output)).toBeNull();
  });

  it("dans les libellés de l'interface", () => {
    const labels = [
      ...Object.values(ASSISTANT_TEXT),
      ...Object.values(COMPOSER_TEXT),
      characterCounter(12, 2500),
      includeAnnotationsLabel(3),
      tooLongWarning(2600, 2500, true),
      viewHint("send", "Générer"),
      viewHint("full", "Générer"),
    ];
    for (const label of labels) expect(forbiddenSymbol(label)).toBeNull();
  });

  it("détecte bien les symboles interdits", () => {
    // Cercle vert, coche, flèche, sablier, croix, coche fine, avertissement + VS16.
    const samples = [0x1f7e2, 0x2705, 0x2192, 0x23f3, 0x2715, 0x2713, 0x26a0, 0xfe0f];
    for (const code of samples) expect(forbiddenSymbol(String.fromCodePoint(code))).not.toBeNull();
    for (const allowed of ["« »", "…", "—", "×", "-", "é"]) {
      expect(forbiddenSymbol(allowed)).toBeNull();
    }
  });
});
