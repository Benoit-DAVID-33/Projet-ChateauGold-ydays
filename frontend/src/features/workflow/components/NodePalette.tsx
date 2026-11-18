/** Palette des nœuds par catégorie : clic = ajout au centre, ou glisser-déposer. */
import clsx from "clsx";
import { useId } from "react";

import type { NodeRegistry } from "../nodes/registry";
import styles from "./NodePalette.module.css";
import { DND_NODE_TYPE } from "./runtime";

interface Props {
  registry: NodeRegistry;
  onAdd(type: string): void;
}

export function NodePalette({ registry, onAdd }: Props) {
  const baseId = useId();
  return (
    <nav className={styles.palette} aria-label="Palette de nœuds">
      <h2 className={styles.heading}>Nœuds</h2>
      <p className={styles.hint}>Cliquez pour ajouter au centre, ou glissez sur le canevas.</p>
      {registry.byCategory().map((group) => {
        const headingId = `${baseId}-${group.id}`;
        return (
          <section key={group.id} className={styles.group} aria-labelledby={headingId}>
            <h3 id={headingId} className={clsx(styles.category, styles[`cat-${group.id}`])}>
              {group.label}
            </h3>
            <ul className={styles.list}>
              {group.nodes.map((definition) => {
                const Icon = definition.icon;
                return (
                  <li key={definition.type}>
                    <button
                      type="button"
                      className={clsx(styles.item, styles[`cat-${group.id}`])}
                      title={definition.description}
                      aria-label={`Ajouter le nœud « ${definition.title} »`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DND_NODE_TYPE, definition.type);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => onAdd(definition.type)}
                    >
                      <Icon aria-hidden className={styles.icon} />
                      <span>{definition.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
