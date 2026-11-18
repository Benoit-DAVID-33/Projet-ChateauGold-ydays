import { WandSparkles } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNote, ParamRow, ParamSelect } from "./fields";
import { mediaInput, textInput } from "./inputs";
import {
  checkPrompt,
  DURATIONS,
  klingRequest,
  resultMessage,
  runKlingGeneration,
  VIDEO_RATIOS,
} from "./kling";

export type OmniUsage = "base" | "feature";

export interface OmniVideoData {
  /** base = transformer la vidéo ; feature = s'en servir comme référence de style. */
  usage: OmniUsage;
  aspectRatio: string;
  duration: string;
}

const USAGE_OPTIONS = [
  { value: "base", label: "Transformer la vidéo" },
  { value: "feature", label: "Référence de style" },
];

/** Kling Omni-Video (mode pro) : transforme une vidéo selon un prompt. */
export const node = defineNode<OmniVideoData>({
  type: "kling-omni-video",
  title: "Omni-Video",
  category: "kling",
  description:
    "Transforme une vidéo avec Kling Omni-Video (mode pro), ou s'en sert comme référence de style.",
  icon: WandSparkles,
  inputs: [
    { id: "video", type: "video", label: "Vidéo" },
    { id: "prompt", type: "text", label: "Prompt" },
  ],
  outputs: [{ id: "video", type: "video", label: "Vidéo" }],
  defaultData: { usage: "base", aspectRatio: "16:9", duration: "5" },
  Params: function OmniVideoParams({ data, onChange, disabled }) {
    return (
      <>
        <ParamSelect
          label="Usage de la vidéo"
          value={data.usage}
          options={USAGE_OPTIONS}
          disabled={disabled}
          onChange={(usage) => onChange({ usage: usage === "feature" ? "feature" : "base" })}
        />
        {data.usage === "feature" ? (
          <ParamRow>
            <ParamSelect
              label="Format"
              value={data.aspectRatio}
              options={VIDEO_RATIOS}
              disabled={disabled}
              onChange={(aspectRatio) => onChange({ aspectRatio })}
            />
            <ParamSelect
              label="Durée"
              value={data.duration}
              options={DURATIONS}
              disabled={disabled}
              onChange={(duration) => onChange({ duration })}
            />
          </ParamRow>
        ) : (
          <ParamNote>Format et durée suivent la vidéo source.</ParamNote>
        )}
      </>
    );
  },
  async execute(ctx, inputs, data) {
    const video = mediaInput(inputs, "video", "video");
    const prompt = checkPrompt(textInput(inputs, "prompt"), true);
    const feature = data.usage === "feature";
    const result = await runKlingGeneration(
      ctx,
      klingRequest({
        kind: "omni_video",
        prompt,
        source_media_id: video.id,
        mode: "pro",
        refer_type: feature ? "feature" : "base",
        aspect_ratio: feature ? data.aspectRatio : null,
        duration: feature ? data.duration : "5",
      }),
    );
    return {
      outputs: { video: mediaValue(result.media) },
      mediaIds: result.mediaIds,
      message: resultMessage(result),
    };
  },
});
