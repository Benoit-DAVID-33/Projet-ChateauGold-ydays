import { useQuery } from "@tanstack/react-query";
import { Library } from "lucide-react";

import { mediaKeys } from "@/features/media/hooks";
import { errorMessage, type Media } from "@/shared/api/client";

import { mediaValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamNote, ParamSelect } from "./fields";

export interface LibraryMediaData {
  mediaId: string | null;
  /** Nature du média choisi : détermine le type de la sortie. */
  mediaKind: Media["kind"];
  /** Nom mémorisé pour l'affichage (le média peut avoir été supprimé). */
  mediaName: string;
}

const NONE = "";

/** Média choisi dans la bibliothèque ; sortie image ou vidéo selon sa nature. */
export const node = defineNode<LibraryMediaData>({
  type: "library-media",
  title: "Média de la bibliothèque",
  category: "sources",
  description: "Choisissez une image ou une vidéo de votre bibliothèque.",
  icon: Library,
  inputs: [],
  outputs: (data) => [
    { id: "media", type: data.mediaKind, label: data.mediaKind === "video" ? "Vidéo" : "Image" },
  ],
  defaultData: { mediaId: null, mediaKind: "image", mediaName: "" },
  validate(data) {
    return data.mediaId ? [] : ["aucun média sélectionné."];
  },
  Params: function LibraryMediaParams({ data, onChange, api, disabled }) {
    const list = useQuery({ queryKey: mediaKeys.list(), queryFn: () => api.media.list() });
    const items = list.data ?? [];
    const missing =
      Boolean(data.mediaId) && list.isSuccess && !items.some((m) => m.id === data.mediaId);
    const options = [
      { value: NONE, label: list.isPending ? "Chargement…" : "Choisir un média" },
      ...(missing && data.mediaId
        ? [{ value: data.mediaId, label: `${data.mediaName} (introuvable)` }]
        : []),
      ...items.map((media) => ({
        value: media.id,
        label: `${media.kind === "video" ? "Vidéo" : "Image"} : ${media.name}`,
      })),
    ];
    return (
      <>
        <ParamSelect
          label="Média"
          value={data.mediaId ?? NONE}
          options={options}
          disabled={disabled}
          onChange={(id) => {
            const media = items.find((m) => m.id === id);
            onChange(
              media
                ? { mediaId: media.id, mediaKind: media.kind, mediaName: media.name }
                : { mediaId: null, mediaName: "" },
            );
          }}
        />
        {list.isError && <ParamNote tone="warning">{errorMessage(list.error)}</ParamNote>}
        {list.isSuccess && items.length === 0 && (
          <ParamNote>La bibliothèque est vide : importez d'abord un média.</ParamNote>
        )}
      </>
    );
  },
  async execute(ctx, _inputs, data) {
    if (!data.mediaId) throw new Error("Aucun média sélectionné.");
    const media = await ctx.api.media.get(data.mediaId);
    if (media.kind !== data.mediaKind) {
      throw new Error(
        `« ${media.name} » est ${media.kind === "video" ? "une vidéo" : "une image"} : sélectionnez-le à nouveau.`,
      );
    }
    return { outputs: { media: mediaValue(media) }, message: media.name };
  },
});
