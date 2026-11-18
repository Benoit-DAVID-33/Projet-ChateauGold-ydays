import clsx from "clsx";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";

import styles from "./SidePanel.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: "left" | "right";
  width?: number;
  /** Bouton « Retour » (sous-menus). */
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Panneau latéral accessible (dialog) avec voile cliquable et fermeture par Échap.
 * Remplace les menus « Outils », sous-menus et le panneau Assistant IA d'origine.
 */
export function SidePanel({
  open,
  onClose,
  title,
  side = "left",
  width = 360,
  onBack,
  footer,
  children,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={clsx(styles.overlay, open && styles.overlayOpen)}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
        className={clsx(styles.panel, styles[side], open && styles.open)}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        <header className={styles.header}>
          {onBack && (
            <button type="button" className={styles.iconBtn} onClick={onBack} aria-label="Retour">
              <ArrowLeft />
            </button>
          )}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </aside>
    </>
  );
}
