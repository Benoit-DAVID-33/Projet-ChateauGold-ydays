import { describe, expect, it } from "vitest";

import { IMAGE, VIDEO, line, shape, shape3d, stroke, text } from "../test/factories";
import {
  boxCenter,
  elementBox,
  isEverVisible,
  positionZone,
  resolveMedia,
  sizeCategory,
  timeWindow,
  toPercent,
} from "./geometry";

const image = resolveMedia(IMAGE);
const video = resolveMedia(VIDEO);

describe("positionZone", () => {
  it.each([
    [10, 10, "Haut-Gauche"],
    [50, 10, "Haut-Centre"],
    [90, 10, "Haut-Droite"],
    [10, 50, "Centre-Gauche"],
    [50, 50, "Centre"],
    [90, 50, "Centre-Droite"],
    [10, 90, "Bas-Gauche"],
    [50, 90, "Bas-Centre"],
    [90, 90, "Bas-Droite"],
  ] as const)("(%s %%, %s %%) donne %s", (x, y, zone) => {
    expect(positionZone(x, y)).toBe(zone);
  });

  it("inclut les bornes 33 et 66 dans Centre", () => {
    expect(positionZone(33, 33)).toBe("Centre");
    expect(positionZone(66, 66)).toBe("Centre");
    expect(positionZone(32.9, 66.1)).toBe("Bas-Gauche");
    expect(positionZone(66.1, 32.9)).toBe("Haut-Droite");
  });

  it("gère les positions hors cadre", () => {
    expect(positionZone(-5, 120)).toBe("Bas-Gauche");
  });
});

describe("sizeCategory", () => {
  it.each([
    [9.9, 9.9, "Très petit"],
    [10, 10, "Petit"],
    [5, 15, "Petit"],
    [19.9, 19.9, "Petit"],
    [20, 20, "Moyen"],
    [39.9, 39.9, "Moyen"],
    [40, 40, "Grand"],
    [59.9, 59.9, "Grand"],
    [60, 60, "Très grand"],
    [100, 100, "Très grand"],
  ] as const)("moyenne de %s %% et %s %% donne %s", (w, h, category) => {
    expect(sizeCategory(w, h)).toBe(category);
  });
});

describe("resolveMedia", () => {
  it("applique le repli historique image 1280×720 sans média", () => {
    expect(resolveMedia(null)).toEqual({
      kind: "image",
      name: "",
      width: 1280,
      height: 720,
      duration: null,
    });
  });

  it("remplace des dimensions invalides par le repli", () => {
    const media = resolveMedia({ kind: "video", name: "v", width: 0, height: Number.NaN });
    expect(media).toMatchObject({ kind: "video", width: 1280, height: 720, duration: null });
  });

  it("garde la durée d'une vidéo et l'ignore pour une image", () => {
    expect(video.duration).toBe(10);
    expect(resolveMedia({ ...IMAGE, duration: 4 }).duration).toBeNull();
  });
});

describe("toPercent", () => {
  it("arrondit à 0,1 comme toFixed(1)", () => {
    expect(toPercent(1, 3)).toBe(33.3);
    expect(toPercent(960, 1920)).toBe(50);
  });

  it("ne produit jamais -0", () => {
    expect(Object.is(toPercent(-0.01, 1000), 0)).toBe(true);
  });
});

describe("elementBox / boxCenter", () => {
  it("normalise les dimensions négatives des formes", () => {
    const box = elementBox(shape({ x: 300, y: 400, width: -100, height: -200 }));
    expect(box).toEqual({ left: 200, top: 200, width: 100, height: 200 });
    expect(boxCenter(box)).toEqual({ x: 250, y: 300 });
  });

  it("encadre les deux extrémités d'une ligne", () => {
    expect(elementBox(line({ start: { x: 900, y: 100 }, end: { x: 100, y: 500 } }))).toEqual({
      left: 100,
      top: 100,
      width: 800,
      height: 400,
    });
  });

  it("encadre tous les points d'un tracé", () => {
    expect(elementBox(stroke())).toEqual({ left: 100, top: 200, width: 200, height: 200 });
    expect(elementBox(stroke({ points: [] }))).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it("estime la boîte d'un texte depuis sa ligne de base gauche", () => {
    // 7 glyphes × 0,6 × 40 px = 168 px ; jambage haut 0,8 × 40 = 32 px.
    expect(elementBox(text())).toEqual({ left: 100, top: 868, width: 168, height: 40 });
  });

  it("traite un objet 3D comme une boîte", () => {
    expect(boxCenter(elementBox(shape3d()))).toEqual({ x: 200, y: 200 });
  });
});

describe("timeWindow", () => {
  it("vaut null pour une image", () => {
    expect(timeWindow(shape({ startTime: 2, endTime: 5 }), image)).toBeNull();
  });

  it("borne le début à 0 et conserve la fin", () => {
    expect(timeWindow(shape({ startTime: -1, endTime: 5.3 }), video)).toEqual({
      startTime: 0,
      endTime: 5.3,
    });
  });

  it("traduit une fin absente ou au-delà de la durée en « jusqu'à la fin »", () => {
    expect(timeWindow(shape({ startTime: 2, endTime: null }), video)?.endTime).toBeNull();
    expect(timeWindow(shape({ startTime: 2, endTime: 12 }), video)?.endTime).toBeNull();
  });
});

describe("isEverVisible", () => {
  it("exclut les fenêtres vides (élément supprimé d'une vidéo)", () => {
    expect(isEverVisible(shape({ startTime: 3, endTime: 3 }), video)).toBe(false);
    expect(isEverVisible(shape({ startTime: 3, endTime: 1 }), video)).toBe(false);
    expect(isEverVisible(shape({ startTime: 3, endTime: 3.1 }), video)).toBe(true);
    expect(isEverVisible(shape({ startTime: 3, endTime: null }), video)).toBe(true);
  });

  it("exclut ce qui n'apparaît qu'après la fin d'une vidéo de durée connue", () => {
    expect(isEverVisible(shape({ startTime: 10 }), video)).toBe(false);
    expect(
      isEverVisible(shape({ startTime: 10 }), resolveMedia({ ...VIDEO, duration: undefined })),
    ).toBe(true);
  });

  it("applique la même règle de fenêtre à une image (t = 0)", () => {
    expect(isEverVisible(shape(), image)).toBe(true);
    expect(isEverVisible(shape({ startTime: 0, endTime: 0 }), image)).toBe(false);
  });

  it("exclut les textes vides et les tracés sans point", () => {
    expect(isEverVisible(text({ text: "   " }), image)).toBe(false);
    expect(isEverVisible(stroke({ points: [] }), image)).toBe(false);
  });
});
