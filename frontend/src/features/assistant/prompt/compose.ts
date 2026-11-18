/**
 * Composition du prompt final de l'Atelier (bloc « Composition » façon
 * Stable Diffusion WebUI) : intention + annotations facultatives.
 *
 * Une seule analyse (`analyzeElements`) alimente le prompt envoyé, le prompt
 * complet anglais et le résumé : ils restent cohérents entre eux comme avec
 * le panneau « Assistant IA » et l'export JSON.
 */
import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { analyzeElements, withoutElements } from "./analyze";
import { renderCompactSummary } from "./describe";
import { renderFullPrompt } from "./fullPrompt";
import { renderSendPrompt } from "./sendPrompt";
import type { ElementsAnalysis } from "./types";

/** Longueur maximale d'un prompt acceptée par le backend (`MAX_PROMPT_LENGTH`). */
export const PROMPT_MAX_LENGTH = 2500;

export interface ComposePromptInput {
  /** Intention saisie dans le champ « Prompt ». */
  intent: string;
  /** Case « Inclure les annotations ». */
  includeAnnotations: boolean;
  elements: readonly AnnotationElement[];
  /** Média annoté ; null : image 1280×720. */
  mediaInfo: MediaInfo | null | undefined;
}

export interface PromptComposition {
  /**
   * Prompt réellement envoyé : `buildSendPrompt(intent, elements, mediaInfo)`
   * si les annotations sont incluses et qu'au moins une est visible, sinon
   * l'intention rognée.
   */
  prompt: string;
  /** Prompt complet anglais correspondant (à copier dans un autre outil). */
  fullPrompt: string;
  /** Résumé compact des annotations, sur une ligne. */
  summary: string;
  /** Annotations ignorées car jamais visibles. */
  ignored: number;
  /** Annotations visibles (décrites dans le prompt si elles sont incluses). */
  annotationCount: number;
  /** Les annotations font effectivement partie du prompt envoyé. */
  annotationsIncluded: boolean;
  /** Longueur du prompt envoyé, en caractères (points de code, comme le backend). */
  length: number;
  /** Le prompt envoyé dépasse `PROMPT_MAX_LENGTH` : l'envoi doit être bloqué. */
  tooLong: boolean;
}

/** Nombre de caractères tel que le backend Python le compte (`len()`). */
export function countCharacters(text: string): number {
  return Array.from(text).length;
}

/** Prompts envoyé / complet, avec ou sans annotations, à partir d'une analyse. */
export function renderPrompts(
  analysis: ElementsAnalysis,
  intent: string,
  includeAnnotations: boolean,
): { send: string; full: string; annotationsIncluded: boolean } {
  const annotationsIncluded = includeAnnotations && analysis.summary.totalElements > 0;
  const source = annotationsIncluded ? analysis : withoutElements(analysis);
  return {
    send: renderSendPrompt(source, intent),
    full: renderFullPrompt(source, intent),
    annotationsIncluded,
  };
}

/** Compose le prompt final (fonction pure). */
export function composePrompt({
  intent,
  includeAnnotations,
  elements,
  mediaInfo,
}: ComposePromptInput): PromptComposition {
  const analysis = analyzeElements(elements, mediaInfo);
  const { send, full, annotationsIncluded } = renderPrompts(analysis, intent, includeAnnotations);
  const length = countCharacters(send);
  return {
    prompt: send,
    fullPrompt: full,
    summary: renderCompactSummary(analysis.summary),
    ignored: analysis.summary.ignored,
    annotationCount: analysis.summary.totalElements,
    annotationsIncluded,
    length,
    tooLong: length > PROMPT_MAX_LENGTH,
  };
}
