import { MonitorPlay } from "lucide-react";

import type { Media } from "@/shared/api/client";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNote, ParamSelect } from "./fields";

export interface AtelierMediaData {
  /** Nature attendue : fixe le type de la sortie pour pouvoir câbler le graphe. */
  kind: Media["kind"];
}

const KIND_OPTIONS = [
  { value: "image", label: "Image" },
  { value: "video", label: "Vidéo" },
];

const noun = (kind: Media["kind"]) => (kind === "video" ? "une vidéo" : "une image");

/** Média actuellement ouvert dans l'Atelier (fourni par l'hôte). */
export const node = defineNode<AtelierMediaData>({
  type: "atelier-media",
  title: "Média de l'Atelier",
  category: "sources",
  description: "Le média ouvert dans l'Atelier au moment de l'exécution.",
  icon: MonitorPlay,
  inputs: [],
  outputs: (data) => [
    { id: "media", type: data.kind, label: data.kind === "video" ? "Vidéo" : "Image" },
  ],
  defaultData: { kind: "image" },
  initialData: (host) => ({ kind: host?.media?.kind ?? "image" }),
  validate(data, { host }) {
    if (!host) return ["l'Atelier n'est pas disponible ici : ouvrez un média dans l'Atelier."];
    if (!host.media) return ["aucun média n'est ouvert dans l'Atelier."];
    if (host.media.kind !== data.kind)
      return [`le média ouvert est ${noun(host.media.kind)}, ce nœud attend ${noun(data.kind)}.`];
    return [];
  },
  Params: function AtelierMediaParams({ data, onChange, host, disabled }) {
    const media = host?.media ?? null;
    return (
      <>
        <ParamSelect
          label="Type attendu"
          value={data.kind}
          options={KIND_OPTIONS}
          disabled={disabled}
          onChange={(kind) => onChange({ kind: kind === "video" ? "video" : "image" })}
        />
        {!host && <ParamNote tone="warning">Atelier indisponible.</ParamNote>}
        {host && !media && <ParamNote tone="warning">Aucun média ouvert dans l'Atelier.</ParamNote>}
        {media && (
          <ParamNote tone={media.kind === data.kind ? "info" : "warning"}>
            Média ouvert : {media.name}
            {media.kind !== data.kind && ` (${noun(media.kind)})`}
          </ParamNote>
        )}
      </>
    );
  },
  async execute(ctx, _inputs, data) {
    const media = ctx.host?.media;
    if (!ctx.host) throw new Error("L'Atelier n'est pas disponible.");
    if (!media) throw new Error("Aucun média n'est ouvert dans l'Atelier.");
    if (media.kind !== data.kind)
      throw new Error(
        `Le média ouvert est ${noun(media.kind)}, ce nœud attend ${noun(data.kind)} : changez le type attendu.`,
      );
    return { outputs: { media: mediaValue(media) }, message: media.name };
  },
});
