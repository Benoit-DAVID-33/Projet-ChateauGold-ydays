import styles from "./FullPageSpinner.module.css";

export function FullPageSpinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status">
      <span className={styles.spinner} aria-hidden />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
