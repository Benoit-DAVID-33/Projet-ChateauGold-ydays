import { RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";

import {
  KIND_LABELS,
  STATUS_LABELS,
  useGenerationHistory,
  useLiveGeneration,
} from "@/features/generation/hooks";
import { useDerivedMedia, useMediaList } from "@/features/media/hooks";
import { MediaCard } from "@/features/media/MediaCard";
import type { Generation, Media, MediaKind } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";

import styles from "./Atelier.module.css";

const HISTORY_SIZE = 10;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

interface Props {
  media: Media | null;
  pageKind: MediaKind;
  /** Recharge le prompt, le mode et les paramètres d'une génération passée. */
  onReuse(generation: Generation): void;
}

/**
 * Historique : générations liées au média ouvert (ou les plus récentes) et
 * médias dérivés (ou, sans média, les médias récents du type de la page).
 */
export function HistoryPanel({ media, pageKind, onReuse }: Props) {
  // Filtrés par l'API : un média ancien retrouve aussi ses générations et ses dérivés.
  const history = useGenerationHistory({ sourceMediaId: media?.id, limit: HISTORY_SIZE });
  const recent = useMediaList(pageKind, 6);
  const derived = useDerivedMedia(media?.id);
  const generations = history.data ?? [];
  const medias = (media ? derived.data : recent.data) ?? [];

  return (
    <div className={styles.history}>
      <h3 className={styles.subTitle}>Générations</h3>
      {generations.length === 0 ? (
        <p className={styles.empty}>
          {media ? "Aucune génération à partir de ce média." : "Aucune génération pour le moment."}
        </p>
      ) : (
        <ol className={styles.historyList}>
          {generations.map((g) => (
            <HistoryItem key={g.id} generation={g} onReuse={onReuse} />
          ))}
        </ol>
      )}

      <h3 className={styles.subTitle}>{media ? "Résultats liés à ce média" : "Médias récents"}</h3>
      {medias.length === 0 ? (
        <p className={styles.empty}>
          {media ? "Aucun dérivé pour le moment." : "Aucun média chargé pour le moment."}
        </p>
      ) : (
        <div className={styles.historyMedia}>
          {medias.map((m) => (
            <MediaCard key={m.id} media={m} />
          ))}
        </div>
      )}
      <Link to="/bibliotheque" className={styles.libraryLink}>
        Voir toute la bibliothèque
      </Link>
    </div>
  );
}

/** Une génération de l'historique, mise à jour tant qu'elle n'est pas terminée. */
function HistoryItem({
  generation,
  onReuse,
}: {
  generation: Generation;
  onReuse(generation: Generation): void;
}) {
  const g = useLiveGeneration(generation);
  return (
    <li className={styles.historyItem}>
      <div className={styles.historyHead}>
        <strong>{KIND_LABELS[g.kind]}</strong>
        <time dateTime={g.created_at}>{dateFormat.format(new Date(g.created_at))}</time>
      </div>
      <p className={styles.outputPrompt} title={g.prompt}>
        {g.prompt || "(sans prompt)"}
      </p>
      <p className={styles.historyStatus} data-status={g.status}>
        {STATUS_LABELS[g.status]}
        {g.status === "failed" && g.error_message ? ` : ${g.error_message}` : ""}
      </p>
      <div className={styles.historyActions}>
        {g.result_media_ids.map((id, index) => (
          <Link key={id} to={`/${g.kind === "text_to_image" ? "image" : "video"}/${id}`}>
            Résultat {index + 1}
          </Link>
        ))}
        <Button
          variant="outline"
          size="sm"
          icon={<RotateCcw />}
          onClick={() => onReuse(g)}
          aria-label={`Réutiliser le prompt et les paramètres (${KIND_LABELS[g.kind]})`}
        >
          Réutiliser
        </Button>
      </div>
    </li>
  );
}
