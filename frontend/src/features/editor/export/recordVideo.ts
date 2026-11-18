/**
 * Enregistrement de la vidéo ANNOTÉE (WebM) : lecture de 0 à la fin, chaque
 * frame = image vidéo + annotations visibles à t (l'original n'incrustait
 * aucune annotation), à la taille native, avec la piste audio si possible.
 * Annulable (AbortSignal) ; l'état de lecture est restauré à la fin.
 * Pause pendant l'enregistrement : le MediaRecorder est mis en pause aussi.
 */
import { clamp } from "../model/geometry";
import type { TextMeasurer } from "../model/text";
import { isVisibleAt, type AnnotationElement } from "../model/types";
import { captureMediaAudio, type AudioCapture } from "./audio";
import {
  composeFrame,
  createCanvas,
  get2dContext,
  renderAnnotationLayer,
  type CanvasFactory,
} from "./compose";
import { pickRecorderMimeType } from "./mimeType";

export interface RecordVideoOptions {
  /** Progression 0..1 (appelée à chaque point de pourcentage). */
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

export interface SceneSource {
  elements: readonly AnnotationElement[];
  measure: TextMeasurer;
}

export type RecorderLike = Pick<
  MediaRecorder,
  "state" | "start" | "stop" | "pause" | "resume" | "ondataavailable" | "onstop" | "onerror"
>;

/** Dépendances navigateur (injectables pour les tests). */
export interface RecorderEnvironment {
  createCanvas: CanvasFactory;
  isTypeSupported: (type: string) => boolean;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
  createRecorder: (stream: MediaStream, options: MediaRecorderOptions) => RecorderLike;
  captureAudio: (media: HTMLMediaElement) => AudioCapture;
  /** Planifie un rappel à la prochaine frame ; renvoie la fonction d'annulation. */
  requestFrame: (video: HTMLVideoElement, callback: () => void) => () => void;
}

export const UNSUPPORTED_MESSAGE =
  "Votre navigateur ne supporte pas l'enregistrement. Essayez Microsoft Edge ou Chrome.";
const FPS = 30;
const SEEK_TIMEOUT_MS = 3000;
const STOP_TIMEOUT_MS = 3000;

const activeRecordings = new WeakSet<HTMLVideoElement>();

function requestVideoFrame(video: HTMLVideoElement, callback: () => void): () => void {
  if (typeof video.requestVideoFrameCallback === "function") {
    const id = video.requestVideoFrameCallback(() => callback());
    return () => video.cancelVideoFrameCallback(id);
  }
  const id = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(id);
}

export function browserRecorderEnvironment(): RecorderEnvironment | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaStream === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return null;
  }
  return {
    createCanvas,
    isTypeSupported: (type) => MediaRecorder.isTypeSupported(type),
    createStream: (tracks) => new MediaStream(tracks),
    createRecorder: (stream, options) => new MediaRecorder(stream, options),
    captureAudio: captureMediaAudio,
    requestFrame: requestVideoFrame,
  };
}

export const abortError = () => new DOMException("Enregistrement annulé.", "AbortError");

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3 && !video.seeking) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, SEEK_TIMEOUT_MS);
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}

/** Clé de visibilité : le calque n'est redessiné que si elle change. */
const visibilityKey = (elements: readonly AnnotationElement[], t: number) =>
  elements
    .filter((el) => isVisibleAt(el, t))
    .map((el) => el.id)
    .join("|");

export function recordAnnotatedVideo(
  video: HTMLVideoElement,
  getScene: () => SceneSource,
  options: RecordVideoOptions = {},
  env: RecorderEnvironment | null = browserRecorderEnvironment(),
): Promise<Blob> {
  const { onProgress, signal } = options;
  if (signal?.aborted) return Promise.reject(abortError());
  if (!env) return Promise.reject(new Error(UNSUPPORTED_MESSAGE));
  if (activeRecordings.has(video)) {
    return Promise.reject(new Error("Un enregistrement est déjà en cours."));
  }
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    return Promise.reject(new Error("Veuillez attendre que la vidéo soit chargée."));
  }
  const mimeType = pickRecorderMimeType(env.isTypeSupported);
  if (!mimeType) {
    return Promise.reject(new Error("Format d'enregistrement non supporté par ce navigateur."));
  }

  const output = env.createCanvas(width, height);
  const layer = env.createCanvas(width, height);
  const outputCtx = get2dContext(output);
  const layerCtx = get2dContext(layer);
  const canvasStream = output.captureStream(FPS);
  const audio = env.captureAudio(video);
  const recorder = env.createRecorder(
    env.createStream([...canvasStream.getVideoTracks(), ...audio.tracks]),
    { mimeType, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 },
  );
  const saved = {
    time: video.currentTime,
    paused: video.paused,
    muted: video.muted,
    loop: video.loop,
    rate: video.playbackRate,
  };
  activeRecordings.add(video);

  return new Promise<Blob>((resolve, reject) => {
    const chunks: Blob[] = [];
    let settled = false;
    let cancelFrame: (() => void) | null = null;
    let lastPercent = -1;
    let layerKey: string | null = null;
    let layerElements: readonly AnnotationElement[] | null = null;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    const report = (ratio: number) => {
      const value = clamp(ratio, 0, 1);
      const percent = Math.floor(value * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      onProgress?.(value);
    };

    const drawFrame = () => {
      const t = video.currentTime;
      const { elements, measure } = getScene();
      const key = visibilityKey(elements, t);
      if (elements !== layerElements || key !== layerKey) {
        renderAnnotationLayer(layerCtx, width, height, elements, t, measure);
        layerElements = elements;
        layerKey = key;
      }
      composeFrame(outputCtx, video, layer, width, height);
      report(duration > 0 ? t / duration : 0);
    };

    const scheduleFrame = () => {
      cancelFrame = env.requestFrame(video, () => {
        if (settled) return;
        drawFrame();
        scheduleFrame();
      });
    };

    const onPause = () => {
      if (!video.ended && recorder.state === "recording") recorder.pause();
    };
    const onPlay = () => {
      if (recorder.state === "paused") recorder.resume();
    };
    const onEnded = () => {
      drawFrame();
      report(1);
      finish(null);
    };
    const onAbort = () => finish(abortError());

    const restorePlayback = () => {
      video.pause();
      video.loop = saved.loop;
      video.playbackRate = saved.rate;
      video.muted = saved.muted;
      try {
        video.currentTime = saved.time;
      } catch {
        // métadonnées indisponibles : on garde la position courante
      }
      if (!saved.paused) video.play().catch(() => {});
    };

    const cleanup = () => {
      cancelFrame?.();
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("ended", onEnded);
      signal?.removeEventListener("abort", onAbort);
      canvasStream.getTracks().forEach((track) => track.stop());
      audio.release();
      activeRecordings.delete(video);
      restorePlayback();
    };

    function finish(error: Error | DOMException | null) {
      if (settled) return;
      settled = true;
      let done = false;
      const complete = () => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        cleanup();
        if (error) reject(error);
        else resolve(new Blob(chunks, { type: "video/webm" }));
      };
      const watchdog = setTimeout(complete, STOP_TIMEOUT_MS);
      if (recorder.state === "inactive") {
        complete();
        return;
      }
      recorder.onstop = complete;
      try {
        recorder.stop();
      } catch {
        complete();
      }
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => finish(new Error("Erreur pendant l'enregistrement vidéo."));
    signal?.addEventListener("abort", onAbort, { once: true });

    video.pause();
    video.loop = false;
    video.playbackRate = 1;
    video.muted = false;
    seekTo(video, 0)
      .then(() => {
        if (settled) return;
        video.addEventListener("pause", onPause);
        video.addEventListener("play", onPlay);
        video.addEventListener("ended", onEnded);
        drawFrame();
        recorder.start(200);
        scheduleFrame();
        return video.play();
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        finish(new Error(`Lecture de la vidéo impossible : ${detail}`));
      });
  });
}
