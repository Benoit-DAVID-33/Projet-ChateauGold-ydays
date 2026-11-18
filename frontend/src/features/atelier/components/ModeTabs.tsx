import clsx from "clsx";
import { useRef, type KeyboardEvent } from "react";

import type { Media } from "@/shared/api/client";

import { MODES, unavailableReason, type AtelierMode } from "../model/modes";
import styles from "./Atelier.module.css";

interface Props {
  mode: AtelierMode;
  media: Media | null;
  onChange(mode: AtelierMode): void;
  /** Identifiant du panneau contrôlé par les onglets (accessibilité). */
  panelId: string;
}

/**
 * Onglets de mode de l'Atelier. Tous les modes sont affichés ; ceux qui ne
 * s'appliquent pas au média ouvert sont désactivés avec leur raison en info-bulle.
 * Flèches gauche et droite : onglet disponible précédent ou suivant.
 */
export function ModeTabs({ mode, media, onChange, panelId }: Props) {
  const refs = useRef<Partial<Record<AtelierMode, HTMLButtonElement | null>>>({});
  const available = MODES.filter((m) => unavailableReason(m.id, media) === null).map((m) => m.id);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = available.indexOf(mode);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = available[(index + step + available.length) % available.length];
    if (next) {
      onChange(next);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label="Mode de l'Atelier"
      onKeyDown={onKeyDown}
    >
      {MODES.map((m) => {
        const reason = unavailableReason(m.id, media);
        const selected = m.id === mode;
        return (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[m.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            disabled={reason !== null}
            title={reason ?? m.description}
            className={clsx(styles.tab, selected && styles.tabActive)}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
