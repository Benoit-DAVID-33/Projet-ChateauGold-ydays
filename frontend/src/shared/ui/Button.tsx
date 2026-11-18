import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary" // dégradé or (action principale)
  | "outline"
  | "dark" // bouton sombre des pages média
  | "tools" // violet (outils d'édition)
  | "assistant" // orange (assistant IA)
  | "success"
  | "danger"
  | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "dark",
  size = "md",
  icon,
  block,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={clsx(styles.btn, styles[variant], styles[size], block && styles.block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}
