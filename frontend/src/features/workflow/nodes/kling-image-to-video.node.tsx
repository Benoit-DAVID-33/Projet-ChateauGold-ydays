import { Film } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamRow, ParamSelect } from "./fields";
import { mediaInput, textInput } from "./inputs";
import {
  checkPrompt,
  DURATIONS,
  klingRequest,
  QUALITIES,
  resultMessage,
  runKlingGeneration,
} from "./kling";

export interface ImageToVideoData {
  duration: string;
  mode: string;
}

/** Kling : anime une image (prompt facultatif). */
export const node = defineNode<ImageToVideoData>({
  type: "kling-image-to-video",
  title: "Image vers vidéo",
  category: "kling",
  description: "Anime une image avec Kling ; le prompt décrivant le mouvement est facultatif.",
  icon: Film,
  inputs: [
    { id: "image", type: "image", label: "Image" },
    { id: "prompt", type: "text", label: "Prompt", optional: true },
  ],
  outputs: [{ id: "video", type: "video", label: "Vidéo" }],
  defaultData: { duration: "5", mode: "std" },
  Params: function ImageToVideoParams({ data, onChange, disabled }) {
    return (
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
    );
  },
  async execute(ctx, inputs, data) {
    const image = mediaInput(inputs, "image", "image");
    const prompt = checkPrompt(textInput(inputs, "prompt"), false);
    const result = await runKlingGeneration(
      ctx,
      klingRequest({
        kind: "image_to_video",
        prompt,
        source_media_id: image.id,
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
