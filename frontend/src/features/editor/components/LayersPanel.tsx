import clsx from "clsx";
import { ArrowDown, ArrowUp, Crosshair, Trash2 } from "lucide-react";
import { useId, type CSSProperties } from "react";

import { elementLabel, timeWindowLabel } from "../model/labels";
import { isVisibleAt, type AnnotationElement } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import styles from "./LayersPanel.module.css";

export interface LayersPanelProps {
  className?: string;
}

interface LayerRowProps {
  element: AnnotationElement;
  selected: boolean;
  isVideo: boolean;
  isFront: boolean;
  isBack: boolean;
}

function LayerRow({ element, selected, isVideo, isFront, isBack }: LayerRowProps) {
  // Ne se re-rend que lorsque la visibilité bascule (pas à chaque frame vidéo).
  const visible = useEditorStore((s) => isVisibleAt(element, s.currentTime));
  const focusElement = useEditorStore((s) => s.focusElement);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const deleteElement = useEditorStore((s) => s.deleteElement);
  const label = elementLabel(element);
  const isEraser = element.type === "stroke" && element.tool === "eraser";

  return (
    <li className={clsx(styles.row, selected && styles.selected, !visible && styles.hidden)}>
      <button
        type="button"
        className={styles.main}
        aria-pressed={selected}
        aria-label={isVideo ? `${label}, ${timeWindowLabel(element)}` : label}
        onClick={() => focusElement(element.id)}
      >
        <span
          className={clsx(styles.swatch, isEraser && styles.eraser)}
          style={{ "--swatch": element.color } as CSSProperties}
          aria-hidden
        />
        <span className={styles.text}>
          <span className={styles.name}>{label}</span>
          {isVideo && <span className={styles.time}>{timeWindowLabel(element)}</span>}
        </span>
        {element.motionTracking && (
          <>
            <Crosshair className={styles.tracking} aria-hidden />
            <span className="visually-hidden">Motion Tracking activé</span>
          </>
        )}
      </button>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={() => bringForward(element.id)}
          disabled={isFront}
          title="Mettre en avant"
          aria-label={`Mettre en avant ${label}`}
        >
          <ArrowUp aria-hidden />
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => sendBackward(element.id)}
          disabled={isBack}
          title="Mettre en arrière"
          aria-label={`Mettre en arrière ${label}`}
        >
          <ArrowDown aria-hidden />
        </button>
        <button
          type="button"
          className={clsx(styles.action, styles.danger)}
          onClick={() => deleteElement(element.id)}
          title="Supprimer"
          aria-label={`Supprimer ${label}`}
        >
          <Trash2 aria-hidden />
        </button>
      </div>
    </li>
  );
}

/**
 * Liste des calques façon SD/Comfy : ordre d'empilement (le premier est
 * au-dessus), sélection au clic (en vidéo, saut au début de l'élément s'il
 * n'est pas visible), réordonnancement et suppression (sémantique image /
 * vidéo du menu contextuel), tous annulables.
 */
export function LayersPanel({ className }: LayersPanelProps) {
  const titleId = useId();
  const elements = useEditorStore((s) => s.elements);
  const selectedId = useEditorStore((s) => s.selectedId);
  const isVideo = useEditorStore((s) => (s.mediaInfo?.kind ?? s.mediaKind) === "video");
  const layers = [...elements].reverse();

  return (
    <section className={clsx(styles.panel, className)} aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Calques
        </h2>
        <span className={styles.count} aria-label={`${elements.length} élément(s)`}>
          {elements.length}
        </span>
      </header>
      {layers.length === 0 ? (
        <p className={styles.empty}>
          Aucun élément. Ajoutez une forme, une ligne ou un texte depuis les outils.
        </p>
      ) : (
        <ol className={styles.list}>
          {layers.map((element, index) => (
            <LayerRow
              key={element.id}
              element={element}
              selected={element.id === selectedId}
              isVideo={isVideo}
              isFront={index === 0}
              isBack={index === layers.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
