/**
 * Export JSON structuré (« Télécharger JSON » / « Voir JSON »).
 *
 * Sur-ensemble versionné de l'objet d'origine (`description`, `elements`,
 * `summary`, `userIntent`, `mediaInfo`), enrichi des deux prompts pour que le
 * fichier reflète exactement ce qui est copié et envoyé.
 */
import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { analyzeElements } from "./analyze";
import { renderPrompts } from "./compose";
import { renderDescription } from "./describe";
import type { StructuredExport } from "./types";

/**
 * Version du format. 1 = objet d'origine (non versionné) ; 2 = coordonnées au
 * centre, `boundsPercent`, couleur, fenêtre temporelle, tracés, prompts.
 */
export const STRUCTURED_EXPORT_VERSION = 2;

export const STRUCTURED_EXPORT_GENERATOR = "GOLD FX — Assistant IA";

export interface StructuredExportOptions {
  /** Date d'export (injectable pour les tests) ; défaut : maintenant. */
  exportedAt?: Date;
  /**
   * Les annotations font-elles partie des prompts (`prompts.send/full`) ?
   * Défaut : oui. Les descripteurs et la description restent toujours exportés.
   */
  includeAnnotations?: boolean;
}

/** Construit l'objet d'export JSON. `mediaInfo` null : image 1280×720. */
export function buildStructuredExport(
  elements: readonly AnnotationElement[],
  userIntent: string,
  mediaInfo: MediaInfo | null | undefined,
  options: StructuredExportOptions = {},
): StructuredExport {
  const analysis = analyzeElements(elements, mediaInfo);
  const { send, full } = renderPrompts(analysis, userIntent, options.includeAnnotations ?? true);
  return {
    version: STRUCTURED_EXPORT_VERSION,
    generator: STRUCTURED_EXPORT_GENERATOR,
    exportedAt: (options.exportedAt ?? new Date()).toISOString(),
    mediaInfo: analysis.media,
    userIntent: userIntent.trim(),
    summary: analysis.summary,
    elements: analysis.elements,
    description: renderDescription(analysis),
    prompts: { send, full },
  };
}

/** Sérialisation lisible (indentation 2, comme l'original). */
export function serializeStructuredExport(data: StructuredExport): string {
  return JSON.stringify(data, null, 2);
}

/** Nom de fichier d'origine : `elements_<timestamp>.json`. */
export function structuredExportFilename(timestamp: number = Date.now()): string {
  return `elements_${timestamp}.json`;
}
