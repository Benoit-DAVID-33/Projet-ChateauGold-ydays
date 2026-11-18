import type { Media } from "@/shared/api/client";

/** Élément de la colonne « Sorties » : génération suivie ou média produit. */
export type AtelierOutput =
  { type: "generation"; id: string } | { type: "media"; media: Media; label: string };

/** Clé stable d'une sortie (une génération ou un média n'apparaît qu'une fois). */
export const outputKey = (output: AtelierOutput): string =>
  output.type === "generation" ? `g-${output.id}` : `m-${output.media.id}`;
