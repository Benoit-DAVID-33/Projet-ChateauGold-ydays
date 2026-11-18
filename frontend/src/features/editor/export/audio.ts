/**
 * Capture de la piste audio d'une vidéo pour l'enregistrement.
 * 1. `captureStream()` du lecteur (Chrome, Edge, Firefox via `mozCaptureStream`) ;
 * 2. repli WebAudio : un seul `MediaElementAudioSourceNode` par <video> (mémorisé,
 *    l'original en recréait un et perdait le son au 2ᵉ enregistrement), relié
 *    aussi à la sortie pour que le son reste audible.
 */
type CapturableMedia = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export interface AudioCapture {
  tracks: MediaStreamTrack[];
  release(): void;
}

const NO_AUDIO: AudioCapture = { tracks: [], release: () => {} };

interface AudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
}
const graphs = new WeakMap<HTMLMediaElement, AudioGraph>();

function fromCaptureStream(media: CapturableMedia): AudioCapture | null {
  const capture = media.captureStream ?? media.mozCaptureStream;
  if (typeof capture !== "function") return null;
  try {
    const stream = capture.call(media);
    const stopAll = () => stream.getTracks().forEach((t) => t.stop());
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      stopAll();
      return null;
    }
    return { tracks, release: stopAll };
  } catch {
    return null; // ex. média d'une autre origine
  }
}

function fromWebAudio(media: HTMLMediaElement): AudioCapture | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    let graph = graphs.get(media);
    if (!graph) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(media);
      source.connect(context.destination);
      graph = { context, source };
      graphs.set(media, graph);
    }
    const { context, source } = graph;
    void context.resume();
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    const tracks = destination.stream.getAudioTracks();
    return {
      tracks,
      release: () => {
        tracks.forEach((t) => t.stop());
        source.disconnect(destination);
      },
    };
  } catch (error) {
    console.warn("Audio non capturé :", error);
    return null;
  }
}

export function captureMediaAudio(media: HTMLMediaElement): AudioCapture {
  return fromCaptureStream(media) ?? fromWebAudio(media) ?? NO_AUDIO;
}
