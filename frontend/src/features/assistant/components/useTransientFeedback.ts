import { useCallback, useEffect, useRef, useState } from "react";

export interface Feedback {
  tone: "success" | "error";
  text: string;
}

/**
 * Message de confirmation éphémère (remplace les `alert()` bloquants
 * d'origine). Les erreurs restent affichées deux fois plus longtemps.
 */
export function useTransientFeedback(durationMs = 2500) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const show = useCallback(
    (next: Feedback) => {
      clearTimeout(timerRef.current);
      setFeedback(next);
      timerRef.current = setTimeout(
        () => setFeedback(null),
        next.tone === "error" ? durationMs * 2 : durationMs,
      );
    },
    [durationMs],
  );

  return { feedback, show };
}
