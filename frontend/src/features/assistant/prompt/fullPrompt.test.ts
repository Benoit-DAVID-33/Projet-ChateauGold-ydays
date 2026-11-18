import { describe, expect, it } from "vitest";

import { IMAGE, VIDEO, line, shape, shape3d, stroke, text } from "../test/factories";
import { buildFullPrompt, COORDINATES_NOTE_EN } from "./fullPrompt";

const RULE = "====================================";

describe("buildFullPrompt — sans élément", () => {
  it("reprend le gabarit d'origine à l'identique", () => {
    expect(buildFullPrompt([], "", null)).toBe(
      "\nCONTEXT - Visual Effects Edition:\n- Media Type: image\n- Resolution: 1280×720\n\n" +
        "USER INTENTION: No specific intention provided\n\nNo elements defined for this task.\n",
    );
  });

  it("inclut l'intention (rognée) et le média", () => {
    const prompt = buildFullPrompt([], "  Add glow  ", VIDEO);
    expect(prompt).toContain("- Media Type: video\n- Resolution: 1920×1080\n");
    expect(prompt).toContain("USER INTENTION: Add glow\n");
  });

  it("considère comme vide une liste dont aucun élément n'est visible", () => {
    expect(buildFullPrompt([shape({ startTime: 1, endTime: 1 })], "", VIDEO)).toContain(
      "No elements defined for this task.",
    );
  });
});

describe("buildFullPrompt — gabarit complet", () => {
  it("produit le prompt complet exact pour une forme sur une image", () => {
    expect(buildFullPrompt([shape()], "Add a glow", IMAGE)).toBe(
      `
=== VISUAL EFFECTS REQUEST FOR IMAGE ===

MEDIA SPECIFICATIONS:
- Type: Image
- Resolution: 1000×1000
- Aspect Ratio: 1.00:1

PRIMARY OBJECTIVE:
Add a glow

${RULE}
SPATIAL LAYOUT & ELEMENTS TO ENHANCE
${RULE}
${COORDINATES_NOTE_EN}

2D GEOMETRIC SHAPES (1):
1. CIRCLE:
   - Location: Centre (50.0%, 50.0%)
   - Size: 10.0% × 10.0% of frame
   - Color: gold (#FFD700)
   - Motion Tracking: Disabled

${RULE}
ELEMENT SUMMARY
${RULE}
- Total Elements: 1
- 3D Objects: 0
- 2D Shapes: 1
- Text Elements: 0
- Lines/Paths: 0
- Freehand Strokes: 0
- Elements with Motion Tracking: 0

${RULE}
INSTRUCTIONS FOR GENERATIVE AI
${RULE}
1. Respect all spatial coordinates provided (position, size, rotation)
2. Apply effects in the specified zones/areas
3. For motion-tracked elements: ensure the effect follows the element/scene movement
4. For static elements: keep the effect in the exact position specified
5. Scale effects appropriately based on element sizes
6. Maintain visual harmony across all elements
7. Execute the primary objective: Add a glow

${RULE}
EXPECTED RESULT
${RULE}
A high-resolution image with:
- All specified effects applied at exact coordinates
- Seamless integration of visual enhancements
- Professional-quality output matching input resolution (1000×1000)
- Consistency with the user's creative vision

Start generation now.`,
    );
  });

  it("remplit la section 3D depuis les vrais champs (plus de « Center (0.0%, 0.0%) » ni « N/A »)", () => {
    const prompt = buildFullPrompt([shape3d({ motionTracking: true })], "", IMAGE);
    expect(prompt).toContain(
      "\n\n3D OBJECTS (1):\n1. CUBE:" +
        "\n   - Location: Haut-Gauche (20.0%, 20.0%)" +
        "\n   - Size: Moyen (20.0% × 20.0% of frame)" +
        "\n   - Rotation: X=0.52rad, Y=-0.10rad" +
        "\n   - Color: gold (#FFD700)" +
        "\n   - Motion Tracking: ENABLED (element should follow scene movement)" +
        "\n   - Pixel Size: 200 × 200 px",
    );
    expect(prompt).not.toMatch(/N\/A|Center \(0\.0%|Default/);
  });

  it("décrit l'objet 3D immobile comme statique", () => {
    expect(buildFullPrompt([shape3d()], "", IMAGE)).toContain(
      "   - Motion Tracking: Disabled (element is static)",
    );
  });

  it("décrit textes, lignes et tracés avec leur couleur réelle", () => {
    const prompt = buildFullPrompt(
      [
        text({ color: "#ff0000", motionTracking: true }),
        line({ line: "zigzag" }),
        stroke({ tool: "pencil" }),
        stroke({ id: "stroke_2", tool: "eraser" }),
      ],
      "",
      IMAGE,
    );
    expect(prompt).toContain(
      '\n\nTEXT ELEMENTS (1):\n1. "Bonjour":' +
        "\n   - Location: Bas-Gauche (18.4%, 88.8%)" +
        "\n   - Font Size: 40px" +
        "\n   - Color: red (#FF0000)" +
        "\n   - Motion Tracking: ENABLED",
    );
    expect(prompt).toContain(
      "\n\nLINES & PATHS (1):\n1. ZIGZAG:" +
        "\n   - From: (10.0%, 10.0%) To: (90.0%, 50.0%)" +
        "\n   - Style: zigzag (twisted zigzag line)" +
        "\n   - Color: gold (#FFD700)" +
        "\n   - Motion Tracking: Disabled",
    );
    expect(prompt).toContain(
      "\n\nFREEHAND STROKES (2):\n1. PENCIL (thin freehand line):" +
        "\n   - Area: Haut-Gauche, from (10.0%, 20.0%) to (30.0%, 40.0%)" +
        "\n   - Color: gold (#FFD700)" +
        "\n   - Motion Tracking: Disabled" +
        "\n2. ERASER:" +
        "\n   - Area: Haut-Gauche, from (10.0%, 20.0%) to (30.0%, 40.0%)" +
        "\n   - Effect: erases the drawings along its path" +
        "\n   - Motion Tracking: Disabled",
    );
    expect(prompt).toContain("- Total Elements: 4\n");
    expect(prompt).toContain("- Freehand Strokes: 2\n");
    expect(prompt).toContain("- Elements with Motion Tracking: 1\n");
    expect(prompt).not.toContain("Default");
  });

  it("décrit la flèche droite et la courbe", () => {
    const prompt = buildFullPrompt([line(), line({ id: "l2", line: "curved" })], "", IMAGE);
    expect(prompt).toContain("1. STRAIGHT-ARROW:");
    expect(prompt).toContain(
      "   - Style: straight-arrow (straight line with an arrowhead at the end point)",
    );
    expect(prompt).toContain("2. CURVED:\n");
    expect(prompt).toContain("   - Style: curved (smooth curved line)");
  });

  it("ordonne les sections 3D, 2D, Texte, Lignes puis Tracés", () => {
    const prompt = buildFullPrompt([stroke(), line(), text(), shape(), shape3d()], "", IMAGE);
    const titles = ["3D OBJECTS", "2D GEOMETRIC SHAPES", "TEXT ELEMENTS", "LINES & PATHS"]
      .concat("FREEHAND STROKES")
      .map((title) => prompt.indexOf(`\n\n${title} (`));
    expect(titles.every((index) => index > 0)).toBe(true);
    expect(titles).toEqual([...titles].sort((a, b) => a - b));
  });

  it("utilise les replis d'intention d'origine", () => {
    const prompt = buildFullPrompt([shape()], "   ", IMAGE);
    expect(prompt).toContain(
      "PRIMARY OBJECTIVE:\nEnhance visual composition with AI-generated effects\n",
    );
    expect(prompt).toContain("7. Execute the primary objective: Improve visual composition\n");
  });

  it("utilise 1280×720 sans média", () => {
    const prompt = buildFullPrompt([shape()], "", null);
    expect(prompt).toContain("- Resolution: 1280×720\n- Aspect Ratio: 1.78:1\n");
  });
});

describe("buildFullPrompt — vidéo", () => {
  it("indique la durée, les fenêtres d'apparition et le résultat vidéo", () => {
    const prompt = buildFullPrompt(
      [shape({ startTime: 2, endTime: 5.3 }), text({ startTime: 1 }), line()],
      "Glow",
      VIDEO,
    );
    expect(prompt).toContain("=== VISUAL EFFECTS REQUEST FOR VIDEO ===");
    expect(prompt).toContain("- Type: Video\n");
    expect(prompt).toContain("- Aspect Ratio: 1.78:1\n- Duration: 10.0s\n");
    expect(prompt).toContain("   - Motion Tracking: Disabled\n   - Visible: from 2.0s to 5.3s");
    expect(prompt).toContain("   - Visible: from 1.0s until the end");
    expect(prompt).toContain("   - Visible: during the whole video");
    expect(prompt).toContain("\nA video with:\n");
  });

  it("n'inclut pas les éléments supprimés dans les compteurs", () => {
    const prompt = buildFullPrompt(
      [shape(), shape({ id: "deleted", startTime: 3, endTime: 2 })],
      "",
      VIDEO,
    );
    expect(prompt).toContain("2D GEOMETRIC SHAPES (1):");
    expect(prompt).toContain("- Total Elements: 1\n");
  });

  it("n'ajoute ni durée ni fenêtre pour une image", () => {
    const prompt = buildFullPrompt([shape()], "", IMAGE);
    expect(prompt).not.toMatch(/Duration|Visible:/);
  });
});
