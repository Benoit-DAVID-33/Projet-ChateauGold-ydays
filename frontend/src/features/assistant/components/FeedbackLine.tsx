import clsx from "clsx";
import { CircleAlert, CircleCheck } from "lucide-react";

import styles from "./shared.module.css";
import type { Feedback } from "./useTransientFeedback";

/** Zone de confirmation éphémère, toujours présente pour les lecteurs d'écran. */
export function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  const Icon = feedback?.tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      className={clsx(styles.feedback, feedback && styles[feedback.tone])}
      role="status"
      aria-live="polite"
    >
      {feedback && <Icon aria-hidden />}
      {feedback?.text}
    </p>
  );
}
