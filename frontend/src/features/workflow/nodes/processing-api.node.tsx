import { Cpu } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNote } from "./fields";
import { mediaInput, textInput } from "./inputs";

/** Envoie un média (et un texte facultatif) à l'API de traitement externe. */
export const node = defineNode<Record<string, never>>({
  type: "processing-api",
  title: "API de traitement",
  category: "processing",
  description:
    "Envoie le média (et une consigne facultative) au service de traitement ; le résultat est enregistré dans la bibliothèque.",
  icon: Cpu,
  inputs: [
    { id: "media", type: "media", label: "Média" },
    { id: "query", type: "text", label: "Consigne", optional: true },
  ],
  outputs: [{ id: "media", type: "media", label: "Média traité" }],
  defaultData: {},
  Params: function ProcessingParams() {
    return <ParamNote>Le média traité est enregistré dans votre bibliothèque.</ParamNote>;
  },
  async execute(ctx, inputs) {
    const source = mediaInput(inputs, "media");
    const query = textInput(inputs, "query").trim();
    ctx.reportProgress({ message: "Traitement en cours…" });
    const media = await ctx.api.media.process(source.id, query);
    return { outputs: { media: mediaValue(media) }, message: `Résultat : ${media.name}` };
  },
});
