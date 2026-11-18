import { Link } from "react-router-dom";

import type { Generation } from "@/shared/api/client";
import { useNow } from "@/shared/hooks/useNow";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import { isFinal, POLL_TIMEOUT_MS, STATUS_LABELS } from "./hooks";

/** Avancement d'une génération et liens vers ses résultats. */
export function GenerationStatusView({ generation }: { generation: Generation }) {
  const now = useNow();
  if (generation.status === "failed") {
    return (
      <StatusMessage tone="error">
        {STATUS_LABELS.failed} : {generation.error_message ?? "raison inconnue"}
      </StatusMessage>
    );
  }
  if (generation.status === "succeeded") {
    return (
      <StatusMessage tone="success">
        {STATUS_LABELS.succeeded} — {generation.result_media_ids.length} résultat(s) ajouté(s) à
        votre bibliothèque.{" "}
        {generation.result_media_ids.map((id, index) => (
          <Link key={id} to={`/${generation.kind === "text_to_image" ? "image" : "video"}/${id}`}>
            Ouvrir le résultat {index + 1}{" "}
          </Link>
        ))}
      </StatusMessage>
    );
  }
  const elapsed = now - new Date(generation.created_at).getTime();
  if (!isFinal(generation) && elapsed > POLL_TIMEOUT_MS) {
    return (
      <StatusMessage tone="info">
        La génération prend plus de temps que prévu. Elle reste consultable dans la bibliothèque.
      </StatusMessage>
    );
  }
  return (
    <StatusMessage tone="loading">
      {STATUS_LABELS[generation.status]} Le traitement peut prendre quelques minutes ; vous pouvez
      continuer à travailler.
    </StatusMessage>
  );
}
