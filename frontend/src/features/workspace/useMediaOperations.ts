import { useState, type RefObject } from "react";

import { useEditorStore, type MediaEditorHandle } from "@/features/editor";
import { useInvalidateMedia } from "@/features/media/hooks";
import { errorMessage, type Media } from "@/shared/api/client";
import { mediaApi, transcodeApi } from "@/shared/api/endpoints";
import { fileTimestamp, saveBlob } from "@/shared/lib/download";
import type { StatusTone } from "@/shared/ui/StatusMessage";

export interface OperationStatus {
  tone: StatusTone;
  text: string;
}

export interface OperationResult extends OperationStatus {
  /** Média produit (export enregistré, résultat de traitement). */
  result?: Media;
}

export interface MediaOperations {
  busy: boolean;
  status: OperationStatus | null;
  /** Enregistrement vidéo en cours (annulable). */
  recording: boolean;
  cancelRecording(): void;
  /** Exporte l'image annotée et l'enregistre comme dérivé du média (bibliothèque). */
  saveAnnotatedImage(): Promise<Media>;
  /** Envoie le média (l'image annotée s'il y a des annotations) et le texte à l'API de traitement. */
  sendToApi(query: string): Promise<void>;
  downloadImage(): Promise<void>;
  saveImageToLibrary(): Promise<void>;
  exportVideo(toLibrary: boolean): Promise<void>;
}

const noMedia = () => Promise.reject(new Error("Aucun média n'est ouvert."));

/**
 * Opérations sur le média ouvert : exports (PNG, MP4 avec repli WebM), enregistrement
 * dans la bibliothèque et envoi à l'API de traitement. Chaque média produit est
 * signalé via `onResult` (colonne « Sorties » de l'Atelier).
 */
export function useMediaOperations(
  media: Media | null,
  editor: RefObject<MediaEditorHandle | null>,
  onResult: (media: Media, label: string) => void,
): MediaOperations {
  const invalidate = useInvalidateMedia();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<OperationStatus | null>(null);
  const [recording, setRecording] = useState<AbortController | null>(null);
  const isVideo = media?.kind === "video";
  const noun = isVideo ? "vidéo" : "image";

  const handle = () => {
    if (!editor.current) throw new Error("L'éditeur n'est pas prêt.");
    return editor.current;
  };

  const saveAnnotatedImage = async (): Promise<Media> => {
    if (!media) return noMedia();
    const blob = await handle().exportImage();
    const saved = await mediaApi.upload(blob, `image_modifiee_${fileTimestamp()}.png`, {
      asExportOf: media.id,
    });
    await invalidate(saved);
    return saved;
  };

  const run = async (label: string, task: () => Promise<OperationResult>) => {
    setBusy(true);
    setStatus({ tone: "loading", text: label });
    try {
      const { result, ...next } = await task();
      setStatus(next);
      if (result) onResult(result, next.text);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ tone: "info", text: "Opération annulée." });
      } else {
        setStatus({ tone: "error", text: errorMessage(error) });
      }
    } finally {
      setBusy(false);
      setRecording(null);
    }
  };

  const sendToApi = (query: string) =>
    run(`Envoi de la ${noun} et de la requête à l'API...`, async () => {
      if (!media) return noMedia();
      const annotated = !isVideo && useEditorStore.getState().elements.length > 0;
      const source = annotated ? await saveAnnotatedImage() : media;
      const processed = await mediaApi.process(source.id, query);
      await invalidate(processed);
      return {
        tone: "success",
        text: `${isVideo ? "Vidéo" : "Image"} envoyée et traitée avec succès.`,
        result: processed,
      };
    });

  const downloadImage = () =>
    run("Export de l'image modifiée...", async () => {
      const blob = await handle().exportImage();
      saveBlob(blob, `image_modifiee_${fileTimestamp()}.png`);
      return { tone: "success", text: "Image téléchargée." };
    });

  const saveImageToLibrary = () =>
    run("Enregistrement de l'image modifiée...", async () => ({
      tone: "success",
      text: "Image annotée enregistrée dans la bibliothèque.",
      result: await saveAnnotatedImage(),
    }));

  const exportVideo = (toLibrary: boolean) => {
    const controller = new AbortController();
    setRecording(controller);
    return run("Enregistrement de la vidéo annotée... 0 %", async () => {
      if (!media) return noMedia();
      const webm = await handle().recordVideo({
        signal: controller.signal,
        onProgress: (ratio) =>
          setStatus({
            tone: "loading",
            text: `Enregistrement de la vidéo annotée... ${Math.round(ratio * 100)} %`,
          }),
      });
      setStatus({ tone: "loading", text: "Conversion en MP4 (FFmpeg)..." });
      try {
        if (toLibrary) {
          const saved = await transcodeApi.webmToLibrary(webm, media.id);
          await invalidate(saved);
          return {
            tone: "success",
            text: "Vidéo annotée enregistrée dans la bibliothèque.",
            result: saved,
          };
        }
        const mp4 = await transcodeApi.webmToMp4(webm);
        saveBlob(mp4, `video_modifiee_annotations_${fileTimestamp()}.mp4`);
        return { tone: "success", text: "Vidéo annotée téléchargée (MP4)." };
      } catch (error) {
        // Repli (comme en v1) : l'enregistrement n'est jamais perdu.
        saveBlob(webm, `video_modifiee_annotations_${fileTimestamp()}.webm`);
        return {
          tone: "info",
          text: `Conversion MP4 impossible (${errorMessage(error)}) : la vidéo annotée a été téléchargée au format WebM.`,
        };
      }
    });
  };

  return {
    busy,
    status,
    recording: recording !== null,
    cancelRecording: () => recording?.abort(),
    saveAnnotatedImage,
    sendToApi,
    downloadImage,
    saveImageToLibrary,
    exportVideo,
  };
}
