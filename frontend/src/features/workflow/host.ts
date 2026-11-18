/**
 * Contrat entre l'onglet Workflow et l'Atelier (éditeur de média) qui l'héberge.
 * Facultatif : sans hôte, les nœuds qui en dépendent le signalent clairement.
 */
import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";
import type { Media } from "@/shared/api/client";

export interface WorkflowHost {
  /** Média actuellement ouvert dans l'Atelier. */
  media: Media | null;
  /** Annotations placées sur ce média (pixels natifs). */
  elements: AnnotationElement[];
  /** Dimensions natives et nature du média ouvert. */
  mediaInfo: MediaInfo | null;
  /** Exporte l'image annotée, l'enregistre dans la bibliothèque et renvoie le média créé. */
  exportAnnotatedImage(): Promise<Media>;
}
