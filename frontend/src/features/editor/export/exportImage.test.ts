import { describe, expect, it } from "vitest";

import { approximateTextWidth } from "../model/text";
import { shape, text } from "../test-utils/fixtures";
import { createRecordingContext } from "../test-utils/recordingContext";
import type { CanvasFactory } from "./compose";
import { exportAnnotatedImage } from "./exportImage";

function fakeCanvasFactory() {
  const created: { canvas: HTMLCanvasElement; rec: ReturnType<typeof createRecordingContext> }[] =
    [];
  const factory: CanvasFactory = (width, height) => {
    const rec = createRecordingContext();
    const canvas = {
      width,
      height,
      getContext: () => rec.ctx,
      toBlob: (cb: BlobCallback, type?: string) => cb(new Blob(["png"], { type })),
    } as unknown as HTMLCanvasElement;
    created.push({ canvas, rec });
    return canvas;
  };
  return { factory, created };
}

function loadedImage(width: number, height: number): HTMLImageElement {
  const img = document.createElement("img");
  Object.defineProperty(img, "complete", { value: true });
  Object.defineProperty(img, "naturalWidth", { value: width });
  Object.defineProperty(img, "naturalHeight", { value: height });
  return img;
}

describe("exportAnnotatedImage", () => {
  it("PNG à la taille native : média puis calque d'annotations, chacun une seule fois", async () => {
    const { factory, created } = fakeCanvasFactory();
    const img = loadedImage(1920, 1080);
    const blob = await exportAnnotatedImage({
      media: img,
      elements: [shape(), text({ startTime: 5 })],
      time: 0,
      measure: approximateTextWidth,
      createCanvas: factory,
    });
    expect(blob.type).toBe("image/png");
    const [output, layer] = created;
    expect(output?.canvas).toMatchObject({ width: 1920, height: 1080 });
    const draws = output!.rec.callsOf("drawImage");
    expect(draws).toHaveLength(2);
    expect(draws[0]?.args).toEqual([img, 0, 0, 1920, 1080]);
    expect(draws[1]?.args[0]).toBe(layer?.canvas);
    // annotations dessinées une fois, sur le calque seulement, et filtrées par le temps
    expect(output!.rec.callsOf("fillRect")).toHaveLength(0);
    expect(layer!.rec.callsOf("fillRect")).toHaveLength(1);
    expect(layer!.rec.callsOf("fillText")).toHaveLength(0);
    // jamais de poignées de sélection
    expect(layer!.rec.callsOf("arc")).toHaveLength(0);
  });

  it("refuse un média non chargé (message d'origine)", async () => {
    const img = document.createElement("img");
    await expect(
      exportAnnotatedImage({ media: img, elements: [], time: 0, measure: approximateTextWidth }),
    ).rejects.toThrow("Veuillez attendre que l'image soit complètement chargée.");
  });
});
