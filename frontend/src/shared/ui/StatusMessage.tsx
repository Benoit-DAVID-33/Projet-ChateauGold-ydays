import clsx from "clsx";
import { CircleAlert, CircleCheck, Info, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./StatusMessage.module.css";

export type StatusTone = "success" | "error" | "loading" | "info";

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  loading: LoaderCircle,
  info: Info,
} as const;

/** Bandeau de statut. Le contenu est rendu en texte (jamais en HTML brut). */
export function StatusMessage({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div
      className={clsx(styles.status, styles[tone])}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon className={clsx(styles.icon, tone === "loading" && styles.spin)} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
