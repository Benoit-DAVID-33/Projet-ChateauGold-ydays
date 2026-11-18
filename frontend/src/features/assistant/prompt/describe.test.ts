import { describe, expect, it } from "vitest";

import { IMAGE, VIDEO, line, shape, shape3d, stroke, text } from "../test/factories";
import { describeElements, summarizeElements } from "./describe";

describe("describeElements — cas vide", () => {
  it("renvoie une description vide et des compteurs à zéro", () => {
    expect(describeElements([], null, "Lueur")).toEqual({
      description: "",
      elements: [],
      summary: {
        totalElements: 0,
        shapes: 0,
        shape3d: 0,
        texts: 0,
        lines: 0,
        strokes: 0,
        ignored: 0,
      },
      userIntent: "Lueur",
      mediaInfo: { kind: "image", name: "", width: 1280, height: 720, duration: null },
    });
  });
});

describe("describeElements — gabarits d'origine", () => {
  it("décrit une forme (gabarit exact, couleur réelle)", () => {
    expect(describeElements([shape()], IMAGE).description).toBe(
      "**FORMES GÉOMÉTRIQUES** (1):\n" +
        "  1. **Rond** (shape_1)\n" +
        "     Position: Centre (50.0%, 50.0%)\n" +
        "     Taille: Petit (10.0% × 10.0%)\n" +
        "     Dimensions en pixels: 100×100px\n" +
        "     Couleur: or (#FFD700)\n" +
        "\n",
    );
  });

  it("décrit un objet 3D depuis ses vrais champs (position, taille, rotation)", () => {
    expect(describeElements([shape3d({ color: "#ff0000" })], IMAGE).description).toBe(
      "**OBJETS 3D** (1):\n" +
        "  1. **Cube** (shape3d_1)\n" +
        "     Position: Haut-Gauche (20.0%, 20.0%)\n" +
        "     Taille: Moyen (20.0% × 20.0%)\n" +
        "     Rotation X: 0.52 rad | Rotation Y: -0.10 rad\n" +
        "     Couleur: rouge (#FF0000)\n" +
        "\n",
    );
  });

  it("décrit un texte avec son contenu et sa taille de police", () => {
    expect(
      describeElements([text({ text: "  Bon\n jour ", fontSize: 39.6 })], IMAGE).description,
    ).toBe(
      "**TEXTES** (1):\n" +
        '  1. "Bon jour" (text_1)\n' +
        // 8 glyphes × 0,6 × 39,6 px, donc centre x = 100 + 95,04 px.
        "     Position: Bas-Gauche (19.5%, 88.8%)\n" +
        "     Taille police: 40px\n" +
        "     Couleur: or (#FFD700)\n" +
        "\n",
    );
  });

  it("décrit une ligne avec son type et ses extrémités", () => {
    expect(describeElements([line({ color: "#123abc" })], IMAGE).description).toBe(
      "**LIGNES/CONNECTEURS** (1):\n" +
        "  1. **Flèche** (line_1)\n" +
        "     Du: (10.0%, 10.0%)\n" +
        "     Au: (90.0%, 50.0%)\n" +
        "     Couleur: #123ABC\n" +
        "\n",
    );
  });

  it("nomme chaque type de ligne avec le libellé de l'éditeur", () => {
    const { description } = describeElements(
      [line({ line: "curved" }), line({ id: "line_2", line: "zigzag" })],
      IMAGE,
    );
    expect(description).toContain("  1. **Courbe** (line_1)\n");
    expect(description).toContain("  2. **Ligne torsadée** (line_2)\n");
  });

  it("décrit les tracés feutre, crayon et gomme", () => {
    const { description } = describeElements(
      [
        stroke(),
        stroke({ id: "stroke_2", tool: "pencil", color: "#000000" }),
        stroke({ id: "stroke_3", tool: "eraser" }),
      ],
      IMAGE,
    );
    expect(description).toBe(
      "**TRACÉS À MAIN LEVÉE** (3):\n" +
        "  1. **Feutre** (stroke_1)\n" +
        "     Zone couverte: Haut-Gauche, de (10.0%, 20.0%) à (30.0%, 40.0%)\n" +
        "     Couleur: or (#FFD700)\n" +
        "  2. **Crayon** (stroke_2)\n" +
        "     Zone couverte: Haut-Gauche, de (10.0%, 20.0%) à (30.0%, 40.0%)\n" +
        "     Couleur: noir (#000000)\n" +
        "  3. **Gomme** (stroke_3)\n" +
        "     Zone couverte: Haut-Gauche, de (10.0%, 20.0%) à (30.0%, 40.0%)\n" +
        "     Effet: efface les tracés situés sous son passage\n" +
        "\n",
    );
  });

  it("ajoute la ligne Motion Tracking seulement quand elle est active", () => {
    const { description } = describeElements(
      [shape({ motionTracking: true }), shape({ id: "shape_2" })],
      IMAGE,
    );
    const tracked = "     Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n";
    expect(description.split(tracked)).toHaveLength(2);
    expect(description.indexOf(tracked)).toBeLessThan(description.indexOf("shape_2"));
  });

  it("ordonne les sections Formes, 3D, Textes, Lignes puis Tracés", () => {
    const { description, elements } = describeElements(
      [stroke(), line(), text(), shape3d(), shape()],
      IMAGE,
    );
    const order = ["FORMES", "OBJETS 3D", "TEXTES", "LIGNES", "TRACÉS"].map((title) =>
      description.indexOf(title),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(elements.map((element) => element.type)).toEqual([
      "shape",
      "shape3d",
      "text",
      "line",
      "stroke",
    ]);
  });

  it("renvoie l'intention et le média résolu", () => {
    const result = describeElements([shape()], VIDEO, "Lueur");
    expect(result.userIntent).toBe("Lueur");
    expect(result.mediaInfo).toEqual({
      kind: "video",
      name: "clip.mp4",
      width: 1920,
      height: 1080,
      duration: 10,
    });
  });
});

describe("describeElements — corrections des bugs d'origine", () => {
  it("calcule la zone sur le centre de l'élément, pas sur son coin", () => {
    // Coin haut-gauche à 20 % (« Haut-Gauche » à l'origine), centre à 50 %.
    const [descriptor] = describeElements(
      [shape({ x: 200, y: 200, width: 600, height: 600 })],
      IMAGE,
    ).elements;
    expect(descriptor).toMatchObject({
      position: "Centre",
      positionPercent: { x: 50, y: 50 },
      boundsPercent: { x: 20, y: 20, width: 60, height: 60 },
      size: "Très grand",
    });
  });

  it("garde zone et pourcentage affiché cohérents aux bornes (32,96 % affiché 33.0 %, donc Centre)", () => {
    // Centre à 329,6 px sur 1000 px.
    const { description, elements } = describeElements(
      [shape({ x: 319.6, y: 489.6, width: 20, height: 20 })],
      IMAGE,
    );
    expect(elements[0]?.position).toBe("Centre");
    expect(description).toContain("Position: Centre (33.0%, 50.0%)");
  });

  it("place une forme juste avant la borne dans Haut-Gauche", () => {
    const { elements } = describeElements(
      [shape({ x: 300, y: 300, width: 50, height: 50 })],
      IMAGE,
    );
    expect(elements[0]?.position).toBe("Haut-Gauche"); // centre à 32,5 %
  });

  it("utilise les pixels natifs : une forme centrée en 1920×1080 est au Centre", () => {
    const { description } = describeElements(
      [shape({ x: 860, y: 440, width: 200, height: 200 })],
      VIDEO,
    );
    expect(description).toContain("Position: Centre (50.0%, 50.0%)");
    expect(description).toContain("Taille: Petit (10.4% × 18.5%)");
    expect(description).toContain("Dimensions en pixels: 200×200px");
  });

  it.each([
    [50, "Très petit"],
    [150, "Petit"],
    [300, "Moyen"],
    [500, "Grand"],
    [700, "Très grand"],
  ] as const)("classe une forme de %s px de côté en « %s »", (side, category) => {
    const { elements } = describeElements([shape({ width: side, height: side })], IMAGE);
    expect(elements[0]).toMatchObject({ size: category });
  });

  it("n'affiche jamais « Default » : la couleur réelle de chaque élément est décrite", () => {
    const { description } = describeElements(
      [shape({ color: "#00ffff" }), text({ color: "#FFFFFF" })],
      IMAGE,
    );
    expect(description).toContain("Couleur: cyan (#00FFFF)");
    expect(description).toContain("Couleur: blanc (#FFFFFF)");
    expect(description).not.toContain("Default");
  });
});

describe("describeElements — fenêtre temporelle et visibilité", () => {
  it("ajoute la fenêtre d'apparition pour une vidéo", () => {
    const { description } = describeElements(
      [
        shape({ startTime: 2, endTime: 5.3 }),
        shape({ id: "shape_2", startTime: 1.5, endTime: null }),
        shape({ id: "shape_3" }),
      ],
      VIDEO,
    );
    expect(description).toContain("     Visible: de 2,0 s à 5,3 s\n");
    expect(description).toContain("     Visible: de 1,5 s jusqu'à la fin\n");
    expect(description).toContain("     Visible: pendant toute la vidéo\n");
  });

  it("place la fenêtre avant la ligne Motion Tracking", () => {
    const { description } = describeElements(
      [text({ startTime: 1, endTime: 2, motionTracking: true })],
      VIDEO,
    );
    expect(description).toContain(
      "     Visible: de 1,0 s à 2,0 s\n     Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n",
    );
  });

  it("n'ajoute aucune fenêtre pour une image", () => {
    expect(describeElements([shape(), line()], IMAGE).description).not.toContain("Visible");
  });

  it("ignore les éléments jamais visibles (supprimés, hors durée, vides)", () => {
    const result = describeElements(
      [
        shape({ id: "visible" }),
        shape({ id: "deleted", startTime: 4, endTime: 4 }),
        line({ id: "after-end", startTime: 12 }),
        text({ id: "empty", text: "" }),
        stroke({ id: "no-points", points: [] }),
      ],
      VIDEO,
    );
    expect(result.elements.map((element) => element.id)).toEqual(["visible"]);
    expect(result.summary).toMatchObject({ totalElements: 1, shapes: 1, lines: 0, ignored: 4 });
    expect(result.description).not.toMatch(/deleted|after-end|empty|no-points/);
  });
});

describe("summarizeElements", () => {
  it("reprend le format d'origine (pas de ligne 3D quand il n'y en a pas)", () => {
    expect(summarizeElements([shape(), text(), line(), line({ id: "line_2" })])).toBe(
      "Composition actuelle:\n   - 1 forme(s)\n   - 1 texte(s)\n   - 2 ligne(s)\n   Total: 4 éléments",
    );
  });

  it("renvoie des zéros sans élément", () => {
    expect(summarizeElements([])).toBe(
      "Composition actuelle:\n   - 0 forme(s)\n   - 0 texte(s)\n   - 0 ligne(s)\n   Total: 0 éléments",
    );
  });

  it("ajoute les objets 3D, les tracés et les éléments ignorés quand il y en a", () => {
    expect(
      summarizeElements(
        [shape3d(), stroke(), shape({ startTime: 2, endTime: 1 }), text({ startTime: 11 })],
        VIDEO,
      ),
    ).toBe(
      "Composition actuelle:\n   - 0 forme(s)\n   - 1 objet(s) 3D\n   - 0 texte(s)\n   - 0 ligne(s)" +
        "\n   - 1 tracé(s) à main levée\n   Total: 2 éléments" +
        "\n   (2 élément(s) jamais visible(s), ignoré(s))",
    );
  });

  it("ne connaît pas la durée sans média : seule la fenêtre vide est exclue", () => {
    expect(summarizeElements([text({ startTime: 11 })])).toContain("Total: 1 éléments");
  });
});
