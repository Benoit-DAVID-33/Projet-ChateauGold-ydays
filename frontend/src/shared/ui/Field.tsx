import type { ReactNode } from "react";

import styles from "./Field.module.css";

interface Props {
  label: string;
  id: string;
  hint?: string;
  children: ReactNode;
}

/** Libellé + champ + aide ; le champ enfant reçoit le style via le conteneur. */
export function Field({ label, id, hint, children }: Props) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  );
}
