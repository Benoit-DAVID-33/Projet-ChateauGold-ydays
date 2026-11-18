import type { ReactNode } from "react";

import styles from "./AuthLayout.module.css";

interface Props {
  title: string;
  subtitle: string;
  visualIcon: ReactNode;
  visualTitle: string;
  visualText: string;
  children: ReactNode;
}

export function AuthLayout({
  title,
  subtitle,
  visualIcon,
  visualTitle,
  visualText,
  children,
}: Props) {
  return (
    <div className={styles.page}>
      <section className={styles.formSide}>
        <div className={styles.formInner}>
          <div className={styles.logo} aria-label="GOLD FX">
            <span className={styles.gold}>GOLD</span> FX
          </div>
          <h1>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {children}
        </div>
      </section>
      <aside className={styles.visual} aria-hidden>
        <div className={styles.visualInner}>
          <div className={styles.visualIcon}>{visualIcon}</div>
          <h2>{visualTitle}</h2>
          <p>{visualText}</p>
        </div>
      </aside>
    </div>
  );
}
