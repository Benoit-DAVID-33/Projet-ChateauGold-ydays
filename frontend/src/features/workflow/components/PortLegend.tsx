/** Légende des couleurs de ports. */
import clsx from "clsx";
import { useId } from "react";

import { PORT_TYPE_LABELS, PORT_TYPES } from "../model/ports";
import styles from "./WorkflowEditor.module.css";

export function PortLegend() {
  const titleId = useId();
  return (
    <div className={styles.legend}>
      <span className={styles.legendTitle} id={titleId}>
        Types de ports
      </span>
      <ul className={styles.legendList} aria-labelledby={titleId}>
        {PORT_TYPES.map((type) => (
          <li key={type} className={styles.legendItem}>
            <span className={clsx(styles.swatch, styles[`swatch-${type}`])} aria-hidden />
            {PORT_TYPE_LABELS[type]}
          </li>
        ))}
      </ul>
    </div>
  );
}
