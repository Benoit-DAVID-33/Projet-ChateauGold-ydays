import { describe, expect, it } from "vitest";

import {
  colorName,
  fixed,
  formatColor,
  formatSecondsEn,
  formatSecondsFr,
  formatTimingEn,
  formatTimingFr,
  normalizeColor,
} from "./format";

describe("fixed", () => {
  it("supprime le signe des zéros arrondis", () => {
    expect(fixed(-0.001, 2)).toBe("0.00");
    expect(fixed(-0.1, 2)).toBe("-0.10");
    expect(fixed(0.5236, 2)).toBe("0.52");
  });
});

describe("durées", () => {
  it("formate en français avec virgule et en anglais avec point", () => {
    expect(formatSecondsFr(2)).toBe("2,0 s");
    expect(formatSecondsFr(5.34)).toBe("5,3 s");
    expect(formatSecondsEn(5.34)).toBe("5.3s");
  });
});

describe("fenêtres temporelles", () => {
  it("renvoie null pour une image", () => {
    expect(formatTimingFr(null)).toBeNull();
    expect(formatTimingEn(null)).toBeNull();
  });

  it("décrit les trois cas en français", () => {
    expect(formatTimingFr({ startTime: 0, endTime: null })).toBe("Visible: pendant toute la vidéo");
    expect(formatTimingFr({ startTime: 2, endTime: null })).toBe(
      "Visible: de 2,0 s jusqu'à la fin",
    );
    expect(formatTimingFr({ startTime: 2, endTime: 5.3 })).toBe("Visible: de 2,0 s à 5,3 s");
    expect(formatTimingFr({ startTime: 0, endTime: 4 })).toBe("Visible: de 0,0 s à 4,0 s");
  });

  it("décrit les trois cas en anglais", () => {
    expect(formatTimingEn({ startTime: 0, endTime: null })).toBe("Visible: during the whole video");
    expect(formatTimingEn({ startTime: 2, endTime: null })).toBe(
      "Visible: from 2.0s until the end",
    );
    expect(formatTimingEn({ startTime: 2, endTime: 5.3 })).toBe("Visible: from 2.0s to 5.3s");
  });
});

describe("couleurs", () => {
  it("normalise les hex (majuscules, forme courte développée)", () => {
    expect(normalizeColor("#ffd700")).toBe("#FFD700");
    expect(normalizeColor(" #f00 ")).toBe("#FF0000");
    expect(normalizeColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("nomme les teintes de la palette", () => {
    expect(colorName("#ffd700", "fr")).toBe("or");
    expect(colorName("#FFD700", "en")).toBe("gold");
    expect(colorName("#000080", "fr")).toBe("bleu marine");
    expect(colorName("#123456", "fr")).toBeNull();
  });

  it("formate la couleur réelle au lieu de « Default »", () => {
    expect(formatColor("#ff0000", "fr")).toBe("rouge (#FF0000)");
    expect(formatColor("#FF6347", "en")).toBe("tomato red (#FF6347)");
    expect(formatColor("#123abc", "en")).toBe("#123ABC");
    expect(formatColor("", "fr")).toBe("non définie");
    expect(formatColor("", "en")).toBe("Default");
  });
});
