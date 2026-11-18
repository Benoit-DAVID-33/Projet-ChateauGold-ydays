/**
 * Champs compacts pour les paramètres affichés dans les nœuds. Les classes
 * `nodrag` / `nowheel` empêchent React Flow de déplacer le nœud ou de zoomer
 * pendant la saisie.
 */
import clsx from "clsx";
import { useId, type ReactNode } from "react";

import styles from "./fields.module.css";

interface BaseProps {
  label: string;
  disabled?: boolean;
  hint?: ReactNode;
}

function FieldShell({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  );
}

export function ParamSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: BaseProps & {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select
        id={id}
        className={clsx(styles.control, "nodrag")}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function ParamTextArea({
  label,
  value,
  onChange,
  disabled,
  hint,
  placeholder,
  rows = 3,
  maxLength,
}: BaseProps & {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea
        id={id}
        className={clsx(styles.control, styles.textarea, "nodrag", "nowheel")}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export function ParamText({
  label,
  value,
  onChange,
  disabled,
  hint,
  placeholder,
  maxLength,
}: BaseProps & {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input
        id={id}
        className={clsx(styles.control, "nodrag")}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export function ParamNumber({
  label,
  value,
  onChange,
  disabled,
  hint,
  min,
  max,
}: BaseProps & {
  value: number;
  onChange(value: number): void;
  min: number;
  max: number;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input
        id={id}
        type="number"
        className={clsx(styles.control, "nodrag")}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          const next = Math.round(Number(event.target.value));
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </FieldShell>
  );
}

/** Ligne d'information (texte simple) sous les paramètres. */
export function ParamNote({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return <p className={clsx(styles.note, tone === "warning" && styles.warning)}>{children}</p>;
}

/** Grille de deux champs côte à côte. */
export function ParamRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
