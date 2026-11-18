import clsx from "clsx";
import { Copy } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/shared/ui/Button";

import { copyText } from "../lib/clipboard";
import { countCharacters } from "../prompt/compose";
import { FeedbackLine } from "./FeedbackLine";
import styles from "./shared.module.css";
import { ASSISTANT_TEXT, viewHint } from "./texts";
import { useTransientFeedback } from "./useTransientFeedback";

type PromptView = "send" | "full";

const VIEW_LABELS: Record<PromptView, string> = {
  send: ASSISTANT_TEXT.viewSend,
  full: ASSISTANT_TEXT.viewFull,
};

export interface PromptPreviewProps {
  /** Prompt réellement envoyé (vue par défaut). */
  sendPrompt: string;
  /** Prompt complet anglais, à copier dans un autre outil d'IA. */
  fullPrompt: string;
  /** Libellé de l'action d'envoi, cité dans l'aide (« Envoyer à l'API », « Générer »). */
  sendLabel: string;
  /** id de l'élément (titre) qui nomme la zone d'aperçu. */
  labelledBy: string;
  copyLabel?: string;
  /** Variante resserrée pour la colonne de l'Atelier. */
  compact?: boolean;
}

/**
 * Aperçu des deux prompts (« Prompt envoyé » / « Prompt complet (EN) ») avec
 * copie du texte affiché. Partagé par le panneau et le bloc Prompt inline.
 */
export function PromptPreview({
  sendPrompt,
  fullPrompt,
  sendLabel,
  labelledBy,
  copyLabel = ASSISTANT_TEXT.copy,
  compact = false,
}: PromptPreviewProps) {
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const [view, setView] = useState<PromptView>("send");
  const copyFeedback = useTransientFeedback();
  const shownPrompt = view === "send" ? sendPrompt : fullPrompt;

  const handleCopy = async () => {
    const ok = await copyText(shownPrompt);
    copyFeedback.show(
      ok
        ? { tone: "success", text: ASSISTANT_TEXT.copied }
        : { tone: "error", text: ASSISTANT_TEXT.copyFailed },
    );
  };

  return (
    <>
      <fieldset className={styles.viewSwitch}>
        <legend className="visually-hidden">{ASSISTANT_TEXT.previewViewLegend}</legend>
        {(Object.keys(VIEW_LABELS) as PromptView[]).map((option) => (
          <label
            key={option}
            className={clsx(styles.viewOption, view === option && styles.viewOptionActive)}
          >
            <input
              type="radio"
              name={`${baseId}-view`}
              value={option}
              checked={view === option}
              onChange={() => setView(option)}
              className={styles.viewRadio}
            />
            {VIEW_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <textarea
        readOnly
        className={clsx(styles.preview, compact && styles.previewCompact)}
        value={shownPrompt}
        placeholder={ASSISTANT_TEXT.previewEmpty}
        aria-labelledby={labelledBy}
        aria-describedby={hintId}
      />
      <p id={hintId} className={styles.hint}>
        {viewHint(view, sendLabel)} ({countCharacters(shownPrompt)} caractères)
      </p>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          icon={<Copy aria-hidden />}
          disabled={!shownPrompt}
          onClick={handleCopy}
        >
          {copyLabel}
        </Button>
      </div>
      <FeedbackLine feedback={copyFeedback.feedback} />
    </>
  );
}
