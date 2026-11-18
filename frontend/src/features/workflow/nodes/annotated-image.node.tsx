import { PenTool } from "lucide-react";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNote } from "./fields";

/** Exporte l'image annotée de l'Atelier (enregistrée dans la bibliothèque). */
export const node = defineNode<Record<string, never>>({
  type: "annotated-image",
  title: "Image annotée de l'Atelier",
  category: "sources",
  description:
    "Exporte le média de l'Atelier avec ses annotations, l'enregistre dans la bibliothèque et le transmet comme image.",
  icon: PenTool,
  inputs: [],
  outputs: [{ id: "image", type: "image", label: "Image" }],
  defaultData: {},
  validate(_data, { host }) {
    if (!host) return ["l'Atelier n'est pas disponible ici : ouvrez un média dans l'Atelier."];
    if (!host.media) return ["aucun média n'est ouvert dans l'Atelier."];
    return [];
  },
  Params: function AnnotatedImageParams({ host }) {
    if (!host) return <ParamNote tone="warning">Atelier indisponible.</ParamNote>;
    if (!host.media)
      return <ParamNote tone="warning">Aucun média ouvert dans l'Atelier.</ParamNote>;
    const count = host.elements.length;
    return (
      <ParamNote>
        {host.media.name} :{" "}
        {count === 0 ? "aucune annotation" : `${count} annotation${count > 1 ? "s" : ""}`}
      </ParamNote>
    );
  },
  async execute(ctx) {
    if (!ctx.host) throw new Error("L'Atelier n'est pas disponible.");
    if (!ctx.host.media) throw new Error("Aucun média n'est ouvert dans l'Atelier.");
    ctx.reportProgress({ message: "Export de l'image annotée…" });
    const media = await ctx.host.exportAnnotatedImage();
    if (media.kind !== "image") throw new Error("L'export de l'Atelier n'a pas produit une image.");
    return { outputs: { image: mediaValue(media) }, message: `Image enregistrée : ${media.name}` };
  },
});
