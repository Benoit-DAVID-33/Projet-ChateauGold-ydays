import { ImagePlus } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNumber, ParamRow, ParamSelect, ParamText } from "./fields";
import { textInput } from "./inputs";
import {
  checkPrompt,
  IMAGE_RATIOS,
  klingRequest,
  resultMessage,
  runKlingGeneration,
} from "./kling";

export interface TextToImageData {
  aspectRatio: string;
  count: number;
  negativePrompt: string;
}

/** Kling : génère une ou plusieurs images à partir d'un prompt. */
export const node = defineNode<TextToImageData>({
  type: "kling-text-to-image",
  title: "Texte vers image",
  category: "kling",
  description: "Génère des images avec Kling à partir d'un prompt ; la première est transmise.",
  icon: ImagePlus,
  inputs: [{ id: "prompt", type: "text", label: "Prompt" }],
  outputs: [{ id: "image", type: "image", label: "Image" }],
  defaultData: { aspectRatio: "1:1", count: 1, negativePrompt: "" },
  Params: function TextToImageParams({ data, onChange, disabled }) {
    return (
      <>
        <ParamRow>
          <ParamSelect
            label="Format"
            value={data.aspectRatio}
            options={IMAGE_RATIOS}
            disabled={disabled}
            onChange={(aspectRatio) => onChange({ aspectRatio })}
          />
          <ParamNumber
            label="Nombre"
            value={data.count}
            min={1}
            max={9}
            disabled={disabled}
            onChange={(count) => onChange({ count })}
          />
        </ParamRow>
        <ParamText
          label="Prompt négatif"
          value={data.negativePrompt}
          maxLength={2500}
          placeholder="Ce que vous ne voulez pas voir"
          disabled={disabled}
          onChange={(negativePrompt) => onChange({ negativePrompt })}
        />
      </>
    );
  },
  async execute(ctx, inputs, data) {
    const prompt = checkPrompt(textInput(inputs, "prompt"), true);
    const result = await runKlingGeneration(
      ctx,
      klingRequest({
        kind: "text_to_image",
        prompt,
        negative_prompt: String(data.negativePrompt ?? "").trim(),
        aspect_ratio: data.aspectRatio,
        count: Number(data.count) || 1,
      }),
    );
    return {
      outputs: { image: mediaValue(result.media) },
      mediaIds: result.mediaIds,
      message: resultMessage(result),
    };
  },
});
