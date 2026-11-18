import clsx from "clsx";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { countCharacters, PROMPT_MAX_LENGTH } from "../prompt/compose";
import { buildStructuredExport, serializeStructuredExport } from "../prompt/structuredExport";
import { JsonExportActions } from "./JsonExportActions";
import styles from "./PromptComposer.module.css";
import { PromptPreview } from "./PromptPreview";
import shared from "./shared.module.css";
import { characterCounter, COMPOSER_TEXT, includeAnnotationsLabel, tooLongWarning } from "./texts";
import { usePromptComposition } from "./usePromptComposition";

export interface PromptComposerProps {
  intent: string;
  onIntentChange(v: string): void;
  negativePrompt: string;
  onNegativePromptChange(v: string): void;
  includeAnnotations: boolean;
  onIncludeAnnotationsChange(v: boolean): void;
  /** Annotations de l'éditeur (coordonnées en pixels natifs du média). */
  elements: AnnotationElement[];
  /** Média annoté ; null tant qu'il n'est pas chargé (repli 1280×720). */
  mediaInfo: MediaInfo | null;
  className?: string;
}

/** Hauteur maximale du champ Prompt avant défilement interne. */
const PROMPT_MAX_HEIGHT_PX = 360;

/** Ajuste la hauteur d'une zone de texte à son contenu (borné). */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = "auto";
    const borders = area.offsetHeight - area.clientHeight;
    const wanted = area.scrollHeight + Math.max(0, borders);
    area.style.height = `${Math.min(wanted, PROMPT_MAX_HEIGHT_PX)}px`;
    area.style.overflowY = wanted > PROMPT_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [ref, value]);
}

/**
 * Bloc « Prompt » inline de l'Atelier (style Stable Diffusion WebUI), conçu
 * pour une colonne de 300 à 340 px : prompt, prompt négatif, inclusion des
 * annotations, résumé compact et aperçu repliable du prompt final.
 * Les valeurs sont contrôlées par la page (qui gère GÉNÉRER et les paramètres).
 */
export function PromptComposer({
  intent,
  onIntentChange,
  negativePrompt,
  onNegativePromptChange,
  includeAnnotations,
  onIncludeAnnotationsChange,
  elements,
  mediaInfo,
  className,
}: PromptComposerProps) {
  const baseId = useId();
  const ids = {
    prompt: `${baseId}-prompt`,
    promptCounter: `${baseId}-prompt-counter`,
    promptWarning: `${baseId}-prompt-warning`,
    negative: `${baseId}-negative`,
    negativeCounter: `${baseId}-negative-counter`,
    previewTitle: `${baseId}-preview-title`,
    previewBody: `${baseId}-preview-body`,
  };

  const promptRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(promptRef, intent);
  const [previewOpen, setPreviewOpen] = useState(false);

  const composition = usePromptComposition({ intent, includeAnnotations, elements, mediaInfo });
  const { annotationCount, annotationsIncluded, length, tooLong } = composition;
  const negativeLength = countCharacters(negativePrompt);
  const negativeTooLong = negativeLength > PROMPT_MAX_LENGTH;

  return (
    <section className={clsx(styles.composer, className)} aria-label={COMPOSER_TEXT.region}>
      <div className={styles.field}>
        <label htmlFor={ids.prompt} className={shared.sectionTitle}>
          {COMPOSER_TEXT.prompt}
        </label>
        <textarea
          ref={promptRef}
          id={ids.prompt}
          className={clsx(styles.textarea, styles.prompt)}
          rows={4}
          value={intent}
          placeholder={COMPOSER_TEXT.promptPlaceholder}
          aria-invalid={tooLong || undefined}
          aria-describedby={clsx(ids.promptCounter, tooLong && ids.promptWarning)}
          onChange={(event) => onIntentChange(event.target.value)}
        />
        <p id={ids.promptCounter} className={clsx(styles.counter, tooLong && styles.counterOver)}>
          {characterCounter(length, PROMPT_MAX_LENGTH)}
          {annotationsIncluded && ", annotations comprises"}
        </p>
        {tooLong && (
          <p id={ids.promptWarning} className={shared.fieldError} role="alert">
            <TriangleAlert aria-hidden />
            {tooLongWarning(length, PROMPT_MAX_LENGTH, annotationsIncluded)}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor={ids.negative} className={shared.sectionTitle}>
          {COMPOSER_TEXT.negative}
        </label>
        <textarea
          id={ids.negative}
          className={clsx(styles.textarea, styles.negative)}
          rows={2}
          maxLength={PROMPT_MAX_LENGTH}
          value={negativePrompt}
          placeholder={COMPOSER_TEXT.negativePlaceholder}
          aria-invalid={negativeTooLong || undefined}
          aria-describedby={ids.negativeCounter}
          onChange={(event) => onNegativePromptChange(event.target.value)}
        />
        <p
          id={ids.negativeCounter}
          className={clsx(styles.counter, negativeTooLong && styles.counterOver)}
        >
          {characterCounter(negativeLength, PROMPT_MAX_LENGTH)}
        </p>
      </div>

      <div className={styles.annotations}>
        <label className={clsx(styles.checkbox, annotationCount === 0 && styles.checkboxDisabled)}>
          <input
            type="checkbox"
            checked={includeAnnotations && annotationCount > 0}
            disabled={annotationCount === 0}
            onChange={(event) => onIncludeAnnotationsChange(event.target.checked)}
          />
          {includeAnnotationsLabel(annotationCount)}
        </label>
        <p className={styles.summary}>{composition.summary}</p>
      </div>

      <div className={styles.previewBlock}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={previewOpen}
          aria-controls={ids.previewBody}
          onClick={() => setPreviewOpen((open) => !open)}
        >
          <ChevronRight
            aria-hidden
            className={clsx(styles.chevron, previewOpen && styles.chevronOpen)}
          />
          <span id={ids.previewTitle}>{COMPOSER_TEXT.previewToggle}</span>
        </button>
        {previewOpen && (
          <div
            id={ids.previewBody}
            role="region"
            aria-labelledby={ids.previewTitle}
            className={styles.previewBody}
          >
            <PromptPreview
              sendPrompt={composition.prompt}
              fullPrompt={composition.fullPrompt}
              sendLabel={COMPOSER_TEXT.generateLabel}
              labelledBy={ids.previewTitle}
              copyLabel={COMPOSER_TEXT.copy}
              compact
            />
            <JsonExportActions
              getJson={() =>
                serializeStructuredExport(
                  buildStructuredExport(elements, intent, mediaInfo, { includeAnnotations }),
                )
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
