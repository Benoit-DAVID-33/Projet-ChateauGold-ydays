import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router-dom";

import { GenerationStatusView } from "@/features/generation/GenerationStatus";
import { KIND_LABELS, useGenerationPages, useLiveGeneration } from "@/features/generation/hooks";
import { flattenPages, useDeleteMedia, useMediaPages } from "@/features/media/hooks";
import { MediaCard } from "@/features/media/MediaCard";
import { errorMessage, type Generation, type Media, type MediaKind } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { FullPageSpinner } from "@/shared/ui/FullPageSpinner";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import styles from "./Page.module.css";
import local from "./LibraryPage.module.css";

const FILTERS: { value: MediaKind | undefined; label: string }[] = [
  { value: undefined, label: "Tous" },
  { value: "video", label: "Vidéos" },
  { value: "image", label: "Images" },
];

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default function LibraryPage() {
  const [kind, setKind] = useState<MediaKind | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Media | null>(null);
  const list = useMediaPages(kind);
  const history = useGenerationPages();
  const medias = flattenPages(list.data?.pages);
  const generations = flattenPages(history.data?.pages);
  const remove = useDeleteMedia();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Bibliothèque</h1>
        <div className={local.filters} role="tablist" aria-label="Filtrer par type">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              role="tab"
              type="button"
              aria-selected={kind === f.value}
              className={clsx(local.filter, kind === f.value && local.filterActive)}
              onClick={() => setKind(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.isPending && <FullPageSpinner />}
      {list.isError && <StatusMessage tone="error">{errorMessage(list.error)}</StatusMessage>}
      {list.isSuccess && medias.length === 0 && (
        <section className={styles.card}>
          <h2>Aucun média pour l'instant</h2>
          <p>
            Commencez par charger une <Link to="/video">vidéo</Link> ou une{" "}
            <Link to="/image">image</Link>.
          </p>
        </section>
      )}
      {medias.length > 0 && (
        <div className={styles.grid}>
          {medias.map((media) => (
            <MediaCard key={media.id} media={media} onDelete={setToDelete} />
          ))}
        </div>
      )}
      {list.hasNextPage && (
        <div className={local.more}>
          <Button
            variant="outline"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Charger plus de médias
          </Button>
        </div>
      )}

      <section className={styles.card}>
        <h2>Historique des générations IA</h2>
        {history.isSuccess && generations.length === 0 && (
          <p className={styles.muted}>Aucune génération lancée.</p>
        )}
        <ul className={local.history}>
          {generations.map((generation) => (
            <HistoryEntry key={generation.id} generation={generation} />
          ))}
        </ul>
        {history.hasNextPage && (
          <div className={local.more}>
            <Button
              variant="outline"
              loading={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              Charger plus de générations
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer le média"
        danger
        confirmLabel="Supprimer"
        pending={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() =>
          toDelete && remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) })
        }
      >
        Êtes-vous sûr de vouloir supprimer « {toDelete?.name} » ? Cette action est définitive.
      </ConfirmDialog>
    </div>
  );
}

/** Génération de l'historique, suivie jusqu'à son état final (résultats rapatriés). */
function HistoryEntry({ generation }: { generation: Generation }) {
  const live = useLiveGeneration(generation);
  return (
    <li>
      <div className={local.historyHead}>
        <strong>{KIND_LABELS[live.kind]}</strong>
        <span>{dateFormat.format(new Date(live.created_at))}</span>
      </div>
      {live.prompt && <p className={local.prompt}>{live.prompt}</p>}
      <GenerationStatusView generation={live} />
    </li>
  );
}
