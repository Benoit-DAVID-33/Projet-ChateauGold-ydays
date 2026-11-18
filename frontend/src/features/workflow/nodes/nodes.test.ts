import { describe, expect, it } from "vitest";

import { buildSendPrompt } from "@/features/assistant";

import { outputPorts, resolveData, type ExecutionContext, type NodeInputs } from "../engine/types";
import { mediaValue, textValue } from "../model/values";
import {
  fakeClock,
  fakeHost,
  fakeServices,
  makeContext,
  makeGeneration,
  makeMedia,
  SQUARE,
} from "../test/fakes";
import { NO_HOST_MESSAGE } from "./assistant.node";
import { createNodeRegistry, NODE_REGISTRY } from "./registry";

function definition(type: string) {
  const found = NODE_REGISTRY.get(type);
  if (!found) throw new Error(`nœud ${type} absent du registre`);
  return found;
}

function exec(
  type: string,
  inputs: NodeInputs,
  data: Record<string, unknown> = {},
  ctx = makeContext(),
) {
  const def = definition(type);
  return def.execute(ctx, inputs, resolveData(def, data), ctx.signal);
}

const IMAGE = makeMedia({ id: "img", kind: "image", name: "photo.png" });
const VIDEO = makeMedia({ id: "vid", kind: "video", name: "clip.mp4" });

describe("registre", () => {
  it("contient les douze types de nœuds, regroupés par catégorie", () => {
    expect(
      NODE_REGISTRY.list()
        .map((d) => d.type)
        .sort(),
    ).toEqual(
      [
        "annotated-image",
        "assistant",
        "atelier-media",
        "concat-text",
        "kling-image-to-video",
        "kling-omni-video",
        "kling-text-to-image",
        "kling-text-to-video",
        "library-media",
        "output",
        "processing-api",
        "text",
      ].sort(),
    );
    expect(NODE_REGISTRY.byCategory().map((group) => group.label)).toEqual([
      "Sources",
      "Texte et IA",
      "Génération Kling",
      "Traitement",
      "Sortie",
    ]);
  });

  it("déclare des ports aux identifiants uniques et des titres en français", () => {
    for (const def of NODE_REGISTRY.list()) {
      const data = resolveData(def, {});
      const inputs = typeof def.inputs === "function" ? def.inputs(data) : def.inputs;
      const outputs = typeof def.outputs === "function" ? def.outputs(data) : def.outputs;
      expect(new Set(inputs.map((p) => p.id)).size).toBe(inputs.length);
      expect(new Set(outputs.map((p) => p.id)).size).toBe(outputs.length);
      expect(def.title.length).toBeGreaterThan(2);
      expect(def.description.length).toBeGreaterThan(10);
    }
  });

  it("refuse deux définitions du même type", () => {
    const text = definition("text");
    expect(() => createNodeRegistry([text, text])).toThrow(/déclaré deux fois/);
  });
});

describe("sources", () => {
  it("Texte transmet son contenu", async () => {
    const result = await exec("text", {}, { text: "Bonjour" });
    expect(result.outputs?.text).toEqual(textValue("Bonjour"));
  });

  it("Média de la bibliothèque relit le média et adapte sa sortie", async () => {
    const ctx = makeContext();
    const api = ctx.api as ReturnType<typeof fakeServices>;
    api.media.get.mockResolvedValue(VIDEO);
    const data = { mediaId: "vid", mediaKind: "video", mediaName: "clip.mp4" };
    const result = await exec("library-media", {}, data, ctx);
    expect(api.media.get).toHaveBeenCalledWith("vid");
    expect(result.outputs?.media).toEqual(mediaValue(VIDEO));

    const def = definition("library-media");
    expect(outputPorts(def, data)[0]?.type).toBe("video");
    expect(def.validate?.(resolveData(def, {}), { host: null })).toEqual([
      "aucun média sélectionné.",
    ]);
  });

  it("Média de la bibliothèque échoue sans sélection ou si la nature a changé", async () => {
    await expect(exec("library-media", {})).rejects.toThrow("Aucun média sélectionné.");
    const ctx = makeContext();
    (ctx.api as ReturnType<typeof fakeServices>).media.get.mockResolvedValue(IMAGE);
    await expect(
      exec("library-media", {}, { mediaId: "img", mediaKind: "video" }, ctx),
    ).rejects.toThrow(/une image/);
  });

  it("Média de l'Atelier lit le média de l'hôte", async () => {
    const host = fakeHost();
    const result = await exec("atelier-media", {}, { kind: "video" }, makeContext({ host }));
    expect(result.outputs?.media).toEqual(mediaValue(host.media!));
    await expect(
      exec("atelier-media", {}, { kind: "image" }, makeContext({ host })),
    ).rejects.toThrow(/ce nœud attend une image/);
    await expect(exec("atelier-media", {}, { kind: "video" })).rejects.toThrow(
      "L'Atelier n'est pas disponible.",
    );
    await expect(
      exec(
        "atelier-media",
        {},
        { kind: "video" },
        makeContext({ host: fakeHost({ media: null }) }),
      ),
    ).rejects.toThrow("Aucun média n'est ouvert dans l'Atelier.");
  });

  it("Média de l'Atelier adopte la nature du média ouvert et se valide", () => {
    const def = definition("atelier-media");
    const host = fakeHost();
    expect(def.initialData?.(host)).toEqual({ kind: "video" });
    expect(def.initialData?.(null)).toEqual({ kind: "image" });
    expect(def.validate?.({ kind: "video" }, { host })).toEqual([]);
    expect(def.validate?.({ kind: "image" }, { host })).toEqual([
      "le média ouvert est une vidéo, ce nœud attend une image.",
    ]);
    expect(def.validate?.({ kind: "image" }, { host: null })?.[0]).toMatch(/pas disponible/);
  });

  it("Image annotée exporte via l'hôte", async () => {
    const host = fakeHost();
    const ctx = makeContext({ host });
    const result = await exec("annotated-image", {}, {}, ctx);
    expect(host.exportAnnotatedImage).toHaveBeenCalledTimes(1);
    expect(result.outputs?.image).toMatchObject({ kind: "media", media: { id: "annotated" } });
    expect(ctx.reportProgress).toHaveBeenCalledWith({ message: "Export de l'image annotée…" });
    await expect(exec("annotated-image", {})).rejects.toThrow("L'Atelier n'est pas disponible.");
  });
});

describe("texte et IA", () => {
  it("Assistant IA complète l'intention avec les annotations de l'Atelier", async () => {
    const host = fakeHost();
    const result = await exec(
      "assistant",
      { intent: textValue("Ajoute de la neige") },
      {},
      makeContext({ host }),
    );
    const expected = buildSendPrompt("Ajoute de la neige", [SQUARE], host.mediaInfo);
    expect(expected).toContain("Ajoute de la neige");
    expect(expected.length).toBeGreaterThan("Ajoute de la neige".length);
    expect(result.outputs?.prompt).toEqual(textValue(expected));
    expect(result.preview).toEqual(textValue(expected));
    expect(result.message).toBe("Prompt construit avec 1 annotation.");
  });

  it("Assistant IA sans hôte transmet l'intention et le signale", async () => {
    const result = await exec("assistant", { intent: textValue("  Plan large  ") });
    expect(result.outputs?.prompt).toEqual(textValue("Plan large"));
    expect(result.message).toBe(NO_HOST_MESSAGE);
  });

  it("Assembler du texte utilise le séparateur choisi", async () => {
    const inputs = { a: textValue("un"), b: textValue("deux") };
    expect((await exec("concat-text", inputs)).outputs?.text).toEqual(textValue("un\n\ndeux"));
    expect((await exec("concat-text", inputs, { separator: "comma" })).outputs?.text).toEqual(
      textValue("un, deux"),
    );
    expect(
      (await exec("concat-text", inputs, { separator: "custom", custom: " / " })).outputs?.text,
    ).toEqual(textValue("un / deux"));
    expect(
      (await exec("concat-text", { a: textValue("seul"), b: textValue("  ") })).outputs?.text,
    ).toEqual(textValue("seul"));
  });
});

describe("traitement et sortie", () => {
  it("API de traitement envoie le média et la consigne", async () => {
    const ctx = makeContext();
    const api = ctx.api as ReturnType<typeof fakeServices>;
    const processed = makeMedia({ id: "proc", source: "processed" });
    api.media.process.mockResolvedValue(processed);
    const result = await exec(
      "processing-api",
      { media: mediaValue(VIDEO), query: textValue("  plus net ") },
      {},
      ctx,
    );
    expect(api.media.process).toHaveBeenCalledWith("vid", "plus net");
    expect(result.outputs?.media).toEqual(mediaValue(processed));

    await exec("processing-api", { media: mediaValue(IMAGE) }, {}, ctx);
    expect(api.media.process).toHaveBeenLastCalledWith("img", "");
  });

  it("Sortie prévisualise le média reçu", async () => {
    const result = await exec("output", { media: mediaValue(IMAGE) });
    expect(result.preview).toEqual(mediaValue(IMAGE));
    expect(result.mediaIds).toEqual(["img"]);
    await expect(exec("output", {})).rejects.toThrow(/attend un média/);
  });
});

describe("nœuds Kling", () => {
  function klingContext() {
    const controller = new AbortController();
    const clock = fakeClock();
    const api = fakeServices();
    const ctx: ExecutionContext = makeContext({ api, clock, signal: controller.signal });
    return { ctx, api, clock, controller };
  }

  it("Texte vers image : crée la tâche, interroge toutes les 5 s puis renvoie le premier média", async () => {
    const { ctx, api, clock } = klingContext();
    const first = makeMedia({ id: "r1" });
    api.generation.create.mockResolvedValue(makeGeneration({ id: "g1" }));
    api.generation.get
      .mockResolvedValueOnce(makeGeneration({ id: "g1", status: "processing" }))
      .mockResolvedValueOnce(
        makeGeneration({ id: "g1", status: "succeeded", result_media_ids: ["r1", "r2", "r3"] }),
      );
    api.media.get.mockResolvedValue(first);

    const result = await exec(
      "kling-text-to-image",
      { prompt: textValue("  un chat  ") },
      { aspectRatio: "16:9", count: 3, negativePrompt: "flou" },
      ctx,
    );

    expect(api.generation.create).toHaveBeenCalledWith({
      kind: "text_to_image",
      prompt: "un chat",
      negative_prompt: "flou",
      aspect_ratio: "16:9",
      duration: "5",
      mode: "std",
      count: 3,
      source_media_id: null,
      refer_type: "base",
      keep_original_sound: true,
    });
    expect(clock.sleeps).toEqual([5000, 5000]);
    expect(api.generation.get).toHaveBeenCalledTimes(2);
    expect(api.media.get).toHaveBeenCalledWith("r1");
    expect(result.outputs?.image).toEqual(mediaValue(first));
    expect(result.mediaIds).toEqual(["r1", "r2", "r3"]);
    expect(result.message).toMatch(/^3 résultats générés/);
    expect(ctx.reportProgress).toHaveBeenCalledWith({
      message: "Tâche envoyée, en attente… (0 s)",
    });
    expect(ctx.reportProgress).toHaveBeenCalledWith({
      message: "Génération en cours… (5 s)",
    });
  });

  it("remonte l'erreur d'une génération échouée", async () => {
    const { ctx, api } = klingContext();
    api.generation.create.mockResolvedValue(makeGeneration());
    api.generation.get.mockResolvedValue(
      makeGeneration({ status: "failed", error_message: "Contenu refusé par Kling" }),
    );
    await expect(exec("kling-text-to-video", { prompt: textValue("x") }, {}, ctx)).rejects.toThrow(
      "Contenu refusé par Kling",
    );
    expect(api.media.get).not.toHaveBeenCalled();
  });

  it("s'interrompt dès l'annulation, sans nouvelle requête", async () => {
    const { ctx, api, controller } = klingContext();
    api.generation.create.mockResolvedValue(makeGeneration());
    api.generation.get.mockImplementation(async () => {
      controller.abort();
      return makeGeneration({ status: "processing" });
    });
    await expect(
      exec("kling-text-to-video", { prompt: textValue("x") }, {}, ctx),
    ).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
    expect(api.generation.get).toHaveBeenCalledTimes(1);
    expect(api.media.get).not.toHaveBeenCalled();
  });

  it("abandonne après 30 minutes", async () => {
    const { ctx, api, clock } = klingContext();
    api.generation.create.mockResolvedValue(makeGeneration());
    api.generation.get.mockResolvedValue(makeGeneration({ status: "processing" }));
    await expect(exec("kling-text-to-video", { prompt: textValue("x") }, {}, ctx)).rejects.toThrow(
      /Délai dépassé/,
    );
    expect(clock.sleeps).toHaveLength(360);
  });

  it("refuse un prompt vide et une génération sans résultat", async () => {
    const { ctx, api } = klingContext();
    await expect(exec("kling-text-to-image", { prompt: textValue("  ") }, {}, ctx)).rejects.toThrow(
      "Le prompt est vide : connectez un texte non vide.",
    );
    expect(api.generation.create).not.toHaveBeenCalled();

    api.generation.create.mockResolvedValue(makeGeneration({ status: "succeeded" }));
    await expect(exec("kling-text-to-image", { prompt: textValue("x") }, {}, ctx)).rejects.toThrow(
      "La génération n'a renvoyé aucun résultat.",
    );
  });

  it("Texte vers vidéo transmet format, durée et qualité", async () => {
    const { ctx, api } = klingContext();
    api.generation.create.mockResolvedValue(
      makeGeneration({ status: "succeeded", result_media_ids: ["v"] }),
    );
    api.media.get.mockResolvedValue(VIDEO);
    const result = await exec(
      "kling-text-to-video",
      { prompt: textValue("mer") },
      { aspectRatio: "9:16", duration: "10", mode: "pro" },
      ctx,
    );
    expect(api.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "text_to_video",
        aspect_ratio: "9:16",
        duration: "10",
        mode: "pro",
      }),
    );
    expect(result.outputs?.video).toEqual(mediaValue(VIDEO));
  });

  it("Image vers vidéo envoie l'image source ; le prompt est facultatif", async () => {
    const { ctx, api } = klingContext();
    api.generation.create.mockResolvedValue(
      makeGeneration({ status: "succeeded", result_media_ids: ["v"] }),
    );
    api.media.get.mockResolvedValue(VIDEO);
    await exec("kling-image-to-video", { image: mediaValue(IMAGE) }, { mode: "pro" }, ctx);
    expect(api.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "image_to_video",
        prompt: "",
        source_media_id: "img",
        duration: "5",
        mode: "pro",
        aspect_ratio: null,
      }),
    );
  });

  it("Omni-Video : mode pro, usage base ou référence avec format", async () => {
    const { ctx, api } = klingContext();
    api.generation.create.mockResolvedValue(
      makeGeneration({ status: "succeeded", result_media_ids: ["v"] }),
    );
    api.media.get.mockResolvedValue(VIDEO);
    const inputs = { video: mediaValue(VIDEO), prompt: textValue("noir et blanc") };

    await exec("kling-omni-video", inputs, { usage: "base", aspectRatio: "1:1" }, ctx);
    expect(api.generation.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "omni_video",
        mode: "pro",
        refer_type: "base",
        aspect_ratio: null,
        source_media_id: "vid",
      }),
    );

    await exec(
      "kling-omni-video",
      inputs,
      { usage: "feature", aspectRatio: "1:1", duration: "10" },
      ctx,
    );
    expect(api.generation.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ refer_type: "feature", aspect_ratio: "1:1", duration: "10" }),
    );

    await expect(
      exec("kling-omni-video", { ...inputs, video: mediaValue(IMAGE) }, {}, ctx),
    ).rejects.toThrow(/attend une vidéo/);
  });
});
