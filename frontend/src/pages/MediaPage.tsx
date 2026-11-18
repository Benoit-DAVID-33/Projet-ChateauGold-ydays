import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { mediaRoute, useMedia } from "@/features/media/hooks";
import { MediaWorkspace } from "@/features/workspace/MediaWorkspace";
import { ApiError, errorMessage, type MediaKind } from "@/shared/api/client";
import { FullPageSpinner } from "@/shared/ui/FullPageSpinner";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import styles from "./Page.module.css";

const TITLES: Record<MediaKind, string> = {
  video: "Gestion des Vidéos",
  image: "Gestion des Images",
};

/**
 * Pages /video et /image : Atelier et Workflow. Sans média, l'Atelier propose la
 * zone de dépôt et les générations à partir du texte ; avec un média (/video/:id),
 * l'édition et toutes les générations.
 */
export default function MediaPage({ kind }: { kind: MediaKind }) {
  const { mediaId } = useParams();
  const media = useMedia(mediaId);

  useEffect(() => {
    document.title = `${kind === "video" ? "Vidéo" : "Image"} - GOLD FX`;
  }, [kind]);

  // Une image chargée depuis la page Vidéo (ou l'inverse) est redirigée vers la bonne page.
  if (media.data && media.data.kind !== kind) {
    return <Navigate to={mediaRoute(media.data)} replace />;
  }

  return (
    <div className={`${styles.page} ${styles.pageWide}`}>
      <h1 className={styles.title}>{TITLES[kind]}</h1>

      {!mediaId && <MediaWorkspace key={`new-${kind}`} media={null} pageKind={kind} />}
      {mediaId && media.isPending && <FullPageSpinner />}
      {mediaId && media.isError && (
        <StatusMessage tone="error">
          {media.error instanceof ApiError && media.error.status === 404
            ? "Ce média n'existe pas ou a été supprimé."
            : errorMessage(media.error)}{" "}
          <Link to={`/${kind}`}>Charger un autre fichier</Link>
        </StatusMessage>
      )}
      {media.data && <MediaWorkspace key={media.data.id} media={media.data} pageKind={kind} />}
    </div>
  );
}
