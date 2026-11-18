import { Clapperboard } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamRow, ParamSelect } from "./fields";
import { textInput } from "./inputs";
import {
  checkPrompt,
  DURATIONS,
  klingRequest,
  QUALITIES,
  resultMessage,
  runKlingGeneration,
  VIDEO_RATIOS,
} from "./kling";

export interface TextToVideoData {
  aspectRatio: string;
  duration: string;
  mode: string;
}

/** Kling : génère une vidéo à partir d'un prompt. */
export const node = defineNode<TextToVideoData>({
  type: "kling-text-to-video",
  title: "Texte vers vidéo",
  category: "kling",
  description: "Génère une vidéo avec Kling à partir d'un prompt.",
  icon: Clapperboard,
  inputs: [{ id: "prompt", type: "text", label: "Prompt" }],
  outputs: [{ id: "video", type: "video", label: "Vidéo" }],
  defaultData: { aspectRatio: "16:9", duration: "5", mode: "std" },
  Params: function TextToVideoParams({ data, onChange, disabled }) {
    return (
      <>
        <ParamSelect
          label="Format"
          value={data.aspectRatio}
          options={VIDEO_RATIOS}
          disabled={disabled}
          onChange={(aspectRatio) => onChange({ aspectRatio })}
        />
        <ParamRow>
          <ParamSelect
            label="Durée"
            value={data.duration}
            options={DURATIONS}
            disabled={disabled}
            onChange={(duration) => onChange({ duration })}
          />
          <ParamSelect
            label="Qualité"
            value={data.mode}
            options={QUALITIES}
            disabled={disabled}
            onChange={(mode) => onChange({ mode })}
          />
        </ParamRow>
      </>
    );
  },
  async execute(ctx, inputs, data) {
    const prompt = checkPrompt(textInput(inputs, "prompt"), true);
    const result = await runKlingGeneration(
      ctx,
      klingRequest({
        kind: "text_to_video",
        prompt,
        aspect_ratio: data.aspectRatio,
        duration: data.duration,
        mode: data.mode,
      }),
    );
    return {
      outputs: { video: mediaValue(result.media) },
      mediaIds: result.mediaIds,
      message: resultMessage(result),
    };
  },
});
