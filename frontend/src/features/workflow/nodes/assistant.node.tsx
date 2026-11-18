import { Bot } from "lucide-react";

import { buildSendPrompt } from "@/features/assistant";

import { textValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNote } from "./fields";
import { textInput } from "./inputs";

export const NO_HOST_MESSAGE =
  "Atelier indisponible : l'intention est transmise telle quelle, sans description des annotations.";

/**
 * Assistant IA : complète l'intention avec la description des annotations de
 * l'Atelier (même prompt que le bouton « Envoyer à l'API » de l'Assistant).
 */
export const node = defineNode<Record<string, never>>({
  type: "assistant",
  title: "Assistant IA",
  category: "text",
  description:
    "Construit un prompt à partir de votre intention et des annotations placées dans l'Atelier.",
  icon: Bot,
  inputs: [{ id: "intent", type: "text", label: "Intention" }],
  outputs: [{ id: "prompt", type: "text", label: "Prompt" }],
  defaultData: {},
  Params: function AssistantParams({ host }) {
    if (!host) return <ParamNote tone="warning">{NO_HOST_MESSAGE}</ParamNote>;
    const count = host.elements.length;
    return (
      <ParamNote>
        {count === 0
          ? "Aucune annotation dans l'Atelier : seule l'intention sera transmise."
          : `${count} annotation${count > 1 ? "s" : ""} de l'Atelier seront décrites.`}
      </ParamNote>
    );
  },
  async execute(ctx, inputs) {
    const intent = textInput(inputs, "intent");
    if (!ctx.host)
      return { outputs: { prompt: textValue(intent.trim()) }, message: NO_HOST_MESSAGE };
    const prompt = buildSendPrompt(intent, ctx.host.elements, ctx.host.mediaInfo);
    const count = ctx.host.elements.length;
    return {
      outputs: { prompt: textValue(prompt) },
      preview: textValue(prompt),
      message:
        count === 0
          ? "Prompt construit (aucune annotation)."
          : `Prompt construit avec ${count} annotation${count > 1 ? "s" : ""}.`,
    };
  },
});
