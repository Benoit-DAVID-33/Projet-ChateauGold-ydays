import { Download, ExternalLink, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { Media } from "@/shared/api/client";
import { mediaApi } from "@/shared/api/endpoints";

import { formatBytes, mediaRoute, SOURCE_LABELS } from "./hooks";
import styles from "./MediaCard.module.css";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

interface Props {
  media: Media;
  onDelete?: (media: Media) => void;
}

export function MediaCard({ media, onDelete }: Props) {
  return (
    <article className={styles.card}>
      <Link to={mediaRoute(media)} className={styles.thumb} aria-label={`Ouvrir ${media.name}`}>
        {media.kind === "image" ? (
          <img src={media.content_url} alt="" loading="lazy" />
        ) : (
          <video src={`${media.content_url}#t=0.5`} preload="metadata" muted playsInline />
        )}
        <span className={styles.badge}>{SOURCE_LABELS[media.source]}</span>
      </Link>
      <div className={styles.meta}>
        <strong title={media.name}>{media.name}</strong>
        <span>
          {formatBytes(media.size_bytes)} · {dateFormat.format(new Date(media.created_at))}
        </span>
      </div>
      <div className={styles.actions}>
        <Link to={mediaRoute(media)} title="Ouvrir dans l'éditeur">
          <ExternalLink /> <span className="visually-hidden">Ouvrir</span>
        </Link>
        <a href={mediaApi.downloadUrl(media)} title="Télécharger">
          <Download /> <span className="visually-hidden">Télécharger</span>
        </a>
        {onDelete && (
          <button type="button" onClick={() => onDelete(media)} title="Supprimer">
            <Trash2 /> <span className="visually-hidden">Supprimer</span>
          </button>
        )}
      </div>
    </article>
  );
}
