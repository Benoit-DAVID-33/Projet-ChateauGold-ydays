import { describe, expect, it } from "vitest";

import type { Media } from "@/shared/api/client";

import {
  buildGenerationInput,
  DEFAULT_PARAMS,
  defaultMode,
  generationBlocker,
  MODES,
  paramsFromGeneration,
  unavailableReason,
  visibleParams,
} from "./modes";

const media = (kind: "image" | "video"): Media => ({
  id: `${kind}-1`,
  kind,
  source: "upload",
  name: `source.${kind === "image" ? "png" : "mp4"}`,
  content_type: kind === "image" ? "image/png" : "video/mp4",
  size_bytes: 10,
  created_at: "2026-10-30T10:00:00Z",
  parent_id: null,
  content_url: `/api/media/${kind}-1/content`,
});

describe("disponibilité des modes", () => {
  it("propose les cinq onglets dans l'ordre de l'Atelier", () => {
    expect(MODES.map((m) => m.label)).toEqual([
      "Annoter",
      "Image vers vidéo",
      "Omni-Video",
      "Texte vers image",
      "Texte vers vidéo",
    ]);
  });

  it("n'autorise que les générations texte sans média", () => {
    expect(unavailableReason("annotate", null)).toMatch(/Chargez/);
    expect(unavailableReason("image_to_video", null)).toMatch(/image/);
    expect(unavailableReason("omni_video", null)).toMatch(/vidéo/);
    expect(unavailableReason("text_to_image", null)).toBeNull();
    expect(unavailableReason("text_to_video", null)).toBeNull();
  });

  it("exige le bon type de source", () => {
    expect(unavailableReason("image_to_video", media("image"))).toBeNull();
    expect(unavailableReason("image_to_video", media("video"))).not.toBeNull();
    expect(unavailableReason("omni_video", media("video"))).toBeNull();
    expect(unavailableReason("omni_video", media("image"))).not.toBeNull();
  });

  it("ouvre sur l'annotation avec un média, sinon sur la génération du type de la page", () => {
    expect(defaultMode(media("image"), "image")).toBe("annotate");
    expect(defaultMode(null, "image")).toBe("text_to_image");
    expect(defaultMode(null, "video")).toBe("text_to_video");
  });
});

describe("paramètres visibles", () => {
  it("texte vers image : format et nombre", () => {
    const v = visibleParams("text_to_image", DEFAULT_PARAMS);
    expect(v).toMatchObject({ aspectRatio: true, count: true, duration: false, quality: false });
  });

  it("Omni-Video en transformation suit la vidéo source (ni format ni durée)", () => {
    const v = visibleParams("omni_video", { ...DEFAULT_PARAMS, referType: "base" });
    expect(v).toMatchObject({
      aspectRatio: false,
      duration: false,
      quality: false,
      referType: true,
    });
  });

  it("Omni-Video en référence de style : format et durée", () => {
    const v = visibleParams("omni_video", { ...DEFAULT_PARAMS, referType: "feature" });
    expect(v).toMatchObject({ aspectRatio: true, duration: true });
  });
});

describe("blocage de la génération", () => {
  it("exige un prompt sauf pour image vers vidéo", () => {
    expect(generationBlocker("text_to_image", "  ", null, false)).toMatch(/prompt/);
    expect(generationBlocker("image_to_video", "", media("image"), false)).toBeNull();
  });

  it("refuse un prompt trop long", () => {
    expect(generationBlocker("text_to_video", "ok", null, true)).toMatch(/longueur/);
  });

  it("signale l'absence de source", () => {
    expect(generationBlocker("omni_video", "ok", null, false)).toMatch(/vidéo/);
  });
});

describe("requête de génération", () => {
  it("texte vers image : nombre borné, pas de source, durée ignorée côté API", () => {
    const input = buildGenerationInput(
      "text_to_image",
      { ...DEFAULT_PARAMS, count: 42, aspectRatio: "1:1" },
      "  un phare  ",
      " flou ",
      media("image"),
    );
    expect(input).toMatchObject({
      kind: "text_to_image",
      prompt: "un phare",
      negative_prompt: "flou",
      aspect_ratio: "1:1",
      count: 9,
      source_media_id: null,
    });
  });

  it("Omni-Video : qualité Pro forcée, source et options de référence transmises", () => {
    const input = buildGenerationInput(
      "omni_video",
      { ...DEFAULT_PARAMS, quality: "std", referType: "base", keepOriginalSound: false },
      "style aquarelle",
      "",
      media("video"),
    );
    expect(input).toMatchObject({
      mode: "pro",
      aspect_ratio: null,
      source_media_id: "video-1",
      refer_type: "base",
      keep_original_sound: false,
      count: 1,
    });
  });

  it("image vers vidéo : source image et qualité choisie", () => {
    const input = buildGenerationInput(
      "image_to_video",
      { ...DEFAULT_PARAMS, quality: "pro", duration: "10" },
      "",
      "",
      media("image"),
    );
    expect(input).toMatchObject({
      source_media_id: "image-1",
      mode: "pro",
      duration: "10",
      aspect_ratio: null,
    });
  });
});

describe("réutilisation des paramètres", () => {
  it("relit les paramètres enregistrés et ignore les valeurs inconnues", () => {
    expect(
      paramsFromGeneration({
        aspect_ratio: "9:16",
        duration: "10",
        mode: "pro",
        count: 3,
        refer_type: "feature",
        keep_original_sound: false,
      }),
    ).toEqual({
      aspectRatio: "9:16",
      duration: "10",
      quality: "pro",
      count: 3,
      referType: "feature",
      keepOriginalSound: false,
    });
    expect(paramsFromGeneration({ aspect_ratio: "5:4", count: "x" })).toEqual(DEFAULT_PARAMS);
  });
});
