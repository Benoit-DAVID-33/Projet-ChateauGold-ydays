import { GenerationStatusView } from "@/features/generation/GenerationStatus";
import { KIND_LABELS, useGeneration } from "@/features/generation/hooks";
import { useMedia } from "@/features/media/hooks";
import { MediaCard } from "@/features/media/MediaCard";
import { errorMessage } from "@/shared/api/client";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import { outputKey, type AtelierOutput } from "../model/outputs";
import styles from "./Atelier.module.css";

/** Sorties de la session, de la plus récente à la plus ancienne. */
export function OutputsPanel({ outputs }: { outputs: AtelierOutput[] }) {
  if (outputs.length === 0) {
    return (
      <p className={styles.empty}>
        Les résultats des générations, exports et traitements lancés ici apparaissent dans cette
        colonne.
      </p>
    );
  }
  return (
    <ol className={styles.outputs} aria-label="Sorties">
      {outputs.map((output) => (
        <li key={outputKey(output)}>
          {output.type === "generation" ? (
            <GenerationOutput id={output.id} />
          ) : (
            <div className={styles.output}>
              <p className={styles.outputTitle}>{output.label}</p>
              <MediaCard media={output.media} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function GenerationOutput({ id }: { id: string }) {
  const { data, error } = useGeneration(id);
  if (error) return <StatusMessage tone="error">{errorMessage(error)}</StatusMessage>;
  if (!data) return <StatusMessage tone="loading">Envoi à Kling AI en cours...</StatusMessage>;
  return (
    <div className={styles.output}>
      <p className={styles.outputTitle}>{KIND_LABELS[data.kind]}</p>
      <p className={styles.outputPrompt} title={data.prompt}>
        {data.prompt || "(sans prompt)"}
      </p>
      <GenerationStatusView generation={data} />
      {data.result_media_ids.map((mediaId) => (
        <ResultCard key={mediaId} id={mediaId} />
      ))}
    </div>
  );
}

function ResultCard({ id }: { id: string }) {
  const media = useMedia(id);
  return media.data ? <MediaCard media={media.data} /> : null;
}
