import clsx from "clsx";
import { CloudUpload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import type { Media, MediaKind } from "@/shared/api/client";
import { errorMessage } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import styles from "./Dropzone.module.css";
import { useInvalidateMedia } from "./hooks";
import { uploadMedia } from "./upload";

const ACCEPT: Record<MediaKind, string> = {
  video: "video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mkv,.avi,.mov",
  image: "image/jpeg,image/png,image/gif,image/webp,image/bmp",
};

const LABELS: Record<MediaKind, { button: string; hint: string }> = {
  video: { button: "Charger une vidéo", hint: "MP4, MOV, WebM, MKV, AVI" },
  image: { button: "Charger une image", hint: "JPG, PNG, GIF, WebP, BMP" },
};

interface Props {
  kind: MediaKind;
  onUploaded: (media: Media) => void;
}

/** Zone de dépôt (glisser-déposer annoncé par l'ancienne app mais jamais implémenté). */
export function Dropzone({ kind, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateMedia();

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const media = await uploadMedia(file, setProgress);
      await invalidate(media);
      onUploaded(media);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void send(event.dataTransfer.files[0]);
  };

  const busy = progress !== null;

  return (
    <div className={styles.wrap}>
      <div
        className={clsx(styles.zone, dragging && styles.dragging, busy && styles.busy)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <CloudUpload className={styles.icon} aria-hidden />
        <p>
          Glissez-déposez votre fichier ici
          <br />
          <span className={styles.hint}>{LABELS[kind].hint}</span>
        </p>
        <Button
          variant="primary"
          icon={<CloudUpload />}
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {LABELS[kind].button}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT[kind]}
          className="visually-hidden"
          aria-label={LABELS[kind].button}
          onChange={(event) => {
            void send(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {busy && (
          <div
            className={styles.progress}
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>{Math.round(progress * 100)} %</span>
          </div>
        )}
      </div>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </div>
  );
}
