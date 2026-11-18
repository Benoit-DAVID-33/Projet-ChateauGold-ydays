import { Eye } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { mediaInput } from "./inputs";

/** Point d'arrivée : prévisualise le média reçu et propose de l'ouvrir. */
export const node = defineNode<Record<string, never>>({
  type: "output",
  title: "Sortie",
  category: "output",
  description: "Affiche le média reçu et un lien pour l'ouvrir dans l'Atelier.",
  icon: Eye,
  inputs: [{ id: "media", type: "media", label: "Média" }],
  outputs: [],
  defaultData: {},
  Params: null,
  async execute(_ctx, inputs) {
    const media = mediaInput(inputs, "media");
    return { preview: mediaValue(media), mediaIds: [media.id], message: media.name };
  },
});
