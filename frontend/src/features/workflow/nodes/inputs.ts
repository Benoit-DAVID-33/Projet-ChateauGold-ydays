/** Lecture typée des entrées d'un nœud dans un exécuteur. */
import type { Media } from "@/shared/api/client";

import type { NodeInputs } from "../engine/types";

/** Texte d'une entrée (chaîne vide si l'entrée facultative n'est pas connectée). */
export function textInput(inputs: NodeInputs, port: string): string {
  const value = inputs[port];
  if (!value) return "";
  if (value.kind !== "text") throw new Error(`L'entrée « ${port} » attend un texte.`);
  return value.text;
}

/** Média d'une entrée obligatoire. */
export function mediaInput(inputs: NodeInputs, port: string, kind?: Media["kind"]): Media {
  const value = inputs[port];
  if (!value || value.kind !== "media") throw new Error(`L'entrée « ${port} » attend un média.`);
  if (kind && value.media.kind !== kind)
    throw new Error(`L'entrée « ${port} » attend ${kind === "video" ? "une vidéo" : "une image"}.`);
  return value.media;
}
