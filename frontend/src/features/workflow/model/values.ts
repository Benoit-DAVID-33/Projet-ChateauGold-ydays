/** Valeurs transportées sur les liens pendant l'exécution. */
import type { Media } from "@/shared/api/client";

import type { PortType } from "./ports";

export type WorkflowValue =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "media"; readonly media: Media };

export const textValue = (text: string): WorkflowValue => ({ kind: "text", text });

export const mediaValue = (media: Media): WorkflowValue => ({ kind: "media", media });

/** La valeur respecte-t-elle le type du port ? */
export function valueMatchesPort(value: WorkflowValue, type: PortType): boolean {
  switch (type) {
    case "text":
      return value.kind === "text";
    case "media":
      return value.kind === "media";
    case "image":
    case "video":
      return value.kind === "media" && value.media.kind === type;
  }
}

/** Description courte pour les messages (« une image », « un texte »…). */
export function describeValue(value: WorkflowValue): string {
  if (value.kind === "text") return "un texte";
  return value.media.kind === "video" ? "une vidéo" : "une image";
}
