import { Check, CircleAlert, Download, FileBraces, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";

import { copyText } from "../lib/clipboard";
import { downloadTextFile } from "../lib/download";
import { structuredExportFilename } from "../prompt/structuredExport";
import { FeedbackLine } from "./FeedbackLine";
import styles from "./shared.module.css";
import { ASSISTANT_TEXT } from "./texts";
import { useTransientFeedback } from "./useTransientFeedback";

export interface JsonExportActionsProps {
  /** Produit le JSON sérialisé au moment du clic (instantané de l'état courant). */
  getJson(): string;
  /** Prévient de l'ouverture / fermeture de la modale (Échap réservé à la modale). */
  onModalOpenChange?(open: boolean): void;
}

/**
 * « Télécharger JSON » (vrai fichier `elements_<timestamp>.json`) et
 * « Voir JSON » (modale partagée « Données JSON »).
 */
export function JsonExportActions({ getJson, onModalOpenChange }: JsonExportActionsProps) {
  const jsonAreaRef = useRef<HTMLTextAreaElement>(null);
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const feedback = useTransientFeedback();

  const setModalText = (text: string | null) => {
    setJsonText(text);
    onModalOpenChange?.(text !== null);
  };

  const handleDownload = () => {
    try {
      const filename = structuredExportFilename();
      downloadTextFile(getJson(), filename);
      feedback.show({ tone: "success", text: `${filename} téléchargé.` });
    } catch {
      feedback.show({ tone: "error", text: ASSISTANT_TEXT.downloadFailed });
    }
  };

  const openJson = () => {
    setCopyFailed(false);
    setModalText(getJson());
  };

  const closeJson = () => setModalText(null);

  const handleCopyJson = async () => {
    if (jsonText === null) return;
    if (await copyText(jsonText)) {
      closeJson();
      feedback.show({ tone: "success", text: ASSISTANT_TEXT.jsonCopied });
    } else {
      // Échec : la modale reste ouverte, texte sélectionné pour une copie manuelle.
      setCopyFailed(true);
      jsonAreaRef.current?.select();
    }
  };

  return (
    <>
      <div className={styles.actions}>
        <Button variant="dark" size="sm" icon={<Download aria-hidden />} onClick={handleDownload}>
          {ASSISTANT_TEXT.download}
        </Button>
        <Button variant="dark" size="sm" icon={<FileBraces aria-hidden />} onClick={openJson}>
          {ASSISTANT_TEXT.viewJson}
        </Button>
      </div>
      <FeedbackLine feedback={feedback.feedback} />

      <Modal
        open={jsonText !== null}
        onClose={closeJson}
        title={ASSISTANT_TEXT.jsonTitle}
        footer={
          <>
            <Button
              variant="primary"
              size="sm"
              icon={<Check aria-hidden />}
              onClick={handleCopyJson}
            >
              {ASSISTANT_TEXT.jsonCopyAndClose}
            </Button>
            <Button variant="outline" size="sm" icon={<X aria-hidden />} onClick={closeJson}>
              {ASSISTANT_TEXT.jsonClose}
            </Button>
          </>
        }
      >
        <textarea
          ref={jsonAreaRef}
          readOnly
          className={styles.json}
          value={jsonText ?? ""}
          aria-label={ASSISTANT_TEXT.jsonTitle}
        />
        {copyFailed && (
          <p className={styles.fieldError} role="alert">
            <CircleAlert aria-hidden />
            {ASSISTANT_TEXT.jsonCopyFailed}
          </p>
        )}
      </Modal>
    </>
  );
}
