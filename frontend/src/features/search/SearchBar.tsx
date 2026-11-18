import clsx from "clsx";
import { Mic, MicOff, Search } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";

import { useSpeechRecognition } from "@/shared/hooks/useSpeechRecognition";
import { Button } from "@/shared/ui/Button";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import styles from "./SearchBar.module.css";

interface Props {
  /** Bouton ENVOYER (ou Entrée si `onSearch` n'est pas fourni). */
  onSubmit: (query: string) => void;
  /**
   * Touche Entrée : recherche texte (comportement v1 de la barre globale des
   * pages Vidéo/Image, qui menait à la page Recherche).
   */
  onSearch?: (query: string) => void;
  initialValue?: string;
  submitLabel?: string;
  pending?: boolean;
  placeholder?: string;
}

/**
 * Barre « Comment puis-je vous aider ? » : saisie ou dictée vocale. ENVOYER
 * déclenche `onSubmit` ; Entrée déclenche `onSearch` s'il est fourni.
 */
export function SearchBar({
  onSubmit,
  onSearch,
  initialValue = "",
  submitLabel = "ENVOYER",
  pending,
  placeholder = "Comment puis-je vous aider ?",
}: Props) {
  const [value, setValue] = useState(initialValue);
  const appendSpeech = useCallback(
    (text: string) => setValue((current) => (current ? `${current} ${text}` : text)),
    [],
  );
  const speech = useSpeechRecognition(appendSpeech);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    speech.stop();
    onSubmit(value.trim());
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.bar} onSubmit={submit} role="search">
        <Search className={styles.icon} aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="Requête"
          maxLength={4000}
          onKeyDown={(event) => {
            if (onSearch && event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              speech.stop();
              if (value.trim()) onSearch(value.trim());
            }
          }}
        />
        {/* Toujours visible : sans support navigateur, un clic explique pourquoi. */}
        <button
          type="button"
          className={clsx(styles.mic, speech.listening && styles.listening)}
          onClick={speech.toggle}
          aria-pressed={speech.listening}
          aria-label={speech.listening ? "Arrêter la dictée" : "Dicter au micro"}
          title={speech.listening ? "Arrêter la dictée" : "Dicter au micro"}
        >
          {speech.listening ? <MicOff /> : <Mic />}
        </button>
        <Button type="submit" variant="success" size="sm" loading={pending} className={styles.send}>
          {submitLabel}
        </Button>
      </form>
      {speech.listening && (
        <StatusMessage tone="loading">Écoute en cours... Parlez maintenant</StatusMessage>
      )}
      {speech.error && <StatusMessage tone="error">{speech.error}</StatusMessage>}
    </div>
  );
}
