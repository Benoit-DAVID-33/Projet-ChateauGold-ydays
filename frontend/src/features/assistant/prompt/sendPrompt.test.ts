import { describe, expect, it } from "vitest";

import { IMAGE, VIDEO, shape, shape3d, text } from "../test/factories";
import { describeElements } from "./describe";
import { buildFullPrompt } from "./fullPrompt";
import { buildSendPrompt } from "./sendPrompt";

describe("buildSendPrompt", () => {
  it("envoie l'intention seule (rognée) sans élément", () => {
    expect(buildSendPrompt("  Animer le titre  ", [], VIDEO)).toBe("Animer le titre");
    expect(buildSendPrompt("", [], VIDEO)).toBe("");
  });

  it("ajoute « Éléments placés sur la vidéo: », le repère et la description", () => {
    expect(
      buildSendPrompt("Lueur", [shape({ x: 860, y: 440, width: 200, height: 200 })], VIDEO),
    ).toBe(
      "Lueur\n\nÉléments placés sur la vidéo:\n" +
        "(Repère : vidéo 1920×1080 px ; positions en % de la largeur et de la hauteur, mesurées au centre de chaque élément.)\n" +
        "**FORMES GÉOMÉTRIQUES** (1):\n" +
        "  1. **Rond** (shape_1)\n" +
        "     Position: Centre (50.0%, 50.0%)\n" +
        "     Taille: Petit (10.4% × 18.5%)\n" +
        "     Dimensions en pixels: 200×200px\n" +
        "     Couleur: or (#FFD700)\n" +
        "     Visible: pendant toute la vidéo",
    );
  });

  it("adapte l'en-tête et le repère pour une image", () => {
    const prompt = buildSendPrompt("Lueur", [shape()], IMAGE);
    expect(prompt).toMatch(/^Lueur\n\nÉléments placés sur l'image:\n\(Repère : image 1000×1000 px/);
    expect(prompt).not.toContain("vidéo:");
  });

  it("commence directement par les éléments si l'intention est vide", () => {
    expect(buildSendPrompt("  ", [shape()], IMAGE)).toMatch(/^Éléments placés sur l'image:\n/);
  });

  it("ignore les éléments jamais visibles", () => {
    expect(buildSendPrompt("Lueur", [shape({ startTime: 2, endTime: 2 })], VIDEO)).toBe("Lueur");
  });

  it("reprend exactement la description française (source unique)", () => {
    const elements = [shape(), shape3d(), text({ startTime: 2, endTime: 4 })];
    const { description } = describeElements(elements, VIDEO);
    expect(buildSendPrompt("x", elements, VIDEO).endsWith(description.trimEnd())).toBe(true);
  });

  it("donne les mêmes zones et pourcentages que le prompt complet", () => {
    const elements = [shape({ x: 100, y: 700, width: 120, height: 80 })];
    const send = buildSendPrompt("x", elements, IMAGE);
    const full = buildFullPrompt(elements, "x", IMAGE);
    expect(send).toContain("Position: Bas-Gauche (16.0%, 74.0%)");
    expect(full).toContain("Location: Bas-Gauche (16.0%, 74.0%)");
  });
});
