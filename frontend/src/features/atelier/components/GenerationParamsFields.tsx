import type { GenerationKind } from "@/shared/api/client";

import { ASPECT_RATIOS, visibleParams, type GenerationParams } from "../model/modes";
import styles from "./Atelier.module.css";

interface Props {
  kind: GenerationKind;
  params: GenerationParams;
  onChange(params: GenerationParams): void;
}

/** Paramètres de génération du mode courant (seuls les champs pertinents sont affichés). */
export function GenerationParamsFields({ kind, params, onChange }: Props) {
  const visible = visibleParams(kind, params);
  const set = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) =>
    onChange({ ...params, [key]: value });

  return (
    <div className={styles.params}>
      {visible.referType && (
        <label className={styles.param}>
          <span>Usage de la vidéo</span>
          <select
            value={params.referType}
            onChange={(e) => set("referType", e.target.value as GenerationParams["referType"])}
          >
            <option value="base">Transformer la vidéo</option>
            <option value="feature">Référence de style</option>
          </select>
        </label>
      )}
      {visible.aspectRatio && (
        <label className={styles.param}>
          <span>Format</span>
          <select value={params.aspectRatio} onChange={(e) => set("aspectRatio", e.target.value)}>
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio}>{ratio}</option>
            ))}
          </select>
        </label>
      )}
      {visible.duration && (
        <label className={styles.param}>
          <span>Durée</span>
          <select
            value={params.duration}
            onChange={(e) => set("duration", e.target.value as GenerationParams["duration"])}
          >
            <option value="5">5 secondes</option>
            <option value="10">10 secondes</option>
          </select>
        </label>
      )}
      {visible.quality && (
        <label className={styles.param}>
          <span>Qualité</span>
          <select
            value={params.quality}
            onChange={(e) => set("quality", e.target.value as GenerationParams["quality"])}
          >
            <option value="std">Standard</option>
            <option value="pro">Pro</option>
          </select>
        </label>
      )}
      {visible.count && (
        <label className={styles.param}>
          <span>Nombre d'images</span>
          <input
            type="number"
            min={1}
            max={9}
            value={params.count}
            onChange={(e) => set("count", Number(e.target.value))}
          />
        </label>
      )}
      {visible.keepOriginalSound && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={params.keepOriginalSound}
            onChange={(e) => set("keepOriginalSound", e.target.checked)}
          />
          <span>Conserver le son d'origine</span>
        </label>
      )}
      {kind === "omni_video" && (
        <p className={styles.note}>Omni-Video est toujours généré en qualité Pro.</p>
      )}
    </div>
  );
}
