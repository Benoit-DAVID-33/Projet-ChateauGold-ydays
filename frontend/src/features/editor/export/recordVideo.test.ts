import { describe, expect, it, vi } from "vitest";

import { approximateTextWidth } from "../model/text";
import { shape } from "../test-utils/fixtures";
import { createRecordingContext } from "../test-utils/recordingContext";
import { pickRecorderMimeType } from "./mimeType";
import {
  recordAnnotatedVideo,
  UNSUPPORTED_MESSAGE,
  type RecorderEnvironment,
  type RecorderLike,
} from "./recordVideo";

class FakeVideo extends EventTarget {
  videoWidth = 640;
  videoHeight = 360;
  duration = 4;
  paused = true;
  muted = true;
  loop = true;
  playbackRate = 1.5;
  seeking = false;
  ended = false;
  seeks: number[] = [];
  private time = 1.5;
  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.time = value;
    this.seeks.push(value);
    queueMicrotask(() => this.dispatchEvent(new Event("seeked")));
  }
  /** Avance la lecture sans déclencher de « seeked ». */
  advance(value: number) {
    this.time = value;
  }
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  });
  pause = vi.fn(() => {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
}

class FakeRecorder {
  state: RecordingState = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  options: MediaRecorderOptions;
  constructor(options: MediaRecorderOptions) {
    this.options = options;
  }
  start = vi.fn(() => {
    this.state = "recording";
  });
  pause = vi.fn(() => {
    this.state = "paused";
  });
  resume = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["frames"]) });
    this.onstop?.();
  });
}

function setup(supported: string[] = ["video/webm;codecs=vp8,opus", "video/webm"]) {
  const canvases: { canvas: HTMLCanvasElement; rec: ReturnType<typeof createRecordingContext> }[] =
    [];
  const track = { stop: vi.fn() };
  const audioRelease = vi.fn();
  const frames: (() => void)[] = [];
  let recorder: FakeRecorder | null = null;
  const env: RecorderEnvironment = {
    createCanvas: (width, height) => {
      const rec = createRecordingContext();
      const canvas = {
        width,
        height,
        getContext: () => rec.ctx,
        captureStream: () => ({ getVideoTracks: () => [track], getTracks: () => [track] }),
      } as unknown as HTMLCanvasElement;
      canvases.push({ canvas, rec });
      return canvas;
    },
    isTypeSupported: (type) => supported.includes(type),
    createStream: (tracks) => ({ tracks }) as unknown as MediaStream,
    createRecorder: (_stream, options) => {
      recorder = new FakeRecorder(options);
      return recorder as unknown as RecorderLike;
    },
    captureAudio: () => ({ tracks: [], release: audioRelease }),
    requestFrame: (_video, callback) => {
      frames.push(callback);
      return () => {};
    },
  };
  const video = new FakeVideo();
  return {
    env,
    video,
    asVideo: video as unknown as HTMLVideoElement,
    canvases,
    track,
    audioRelease,
    frames,
    recorder: () => recorder!,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const scene = () => ({ elements: [shape({ startTime: 1 })], measure: approximateTextWidth });

describe("pickRecorderMimeType", () => {
  it("préfère vp9,opus puis vp8,opus puis video/webm", () => {
    expect(pickRecorderMimeType(() => true)).toBe("video/webm;codecs=vp9,opus");
    expect(pickRecorderMimeType((t) => t !== "video/webm;codecs=vp9,opus")).toBe(
      "video/webm;codecs=vp8,opus",
    );
    expect(pickRecorderMimeType((t) => t === "video/webm")).toBe("video/webm");
    expect(pickRecorderMimeType(() => false)).toBeNull();
  });
});

describe("recordAnnotatedVideo", () => {
  it("incruste les annotations visibles à t sur chaque frame et rend un WebM", async () => {
    const t = setup();
    const progress: number[] = [];
    const promise = recordAnnotatedVideo(
      t.asVideo,
      scene,
      { onProgress: (r) => progress.push(r) },
      t.env,
    );
    await flush();
    expect(t.video.seeks[0]).toBe(0);
    expect(t.recorder().options.mimeType).toBe("video/webm;codecs=vp8,opus");
    expect(t.recorder().start).toHaveBeenCalledWith(200);
    expect(t.video.play).toHaveBeenCalled();

    const [output, layer] = t.canvases;
    // t = 0 : la forme (startTime 1) n'est pas encore visible
    expect(layer!.rec.callsOf("fillRect")).toHaveLength(0);
    t.video.advance(2);
    t.frames.shift()?.();
    expect(layer!.rec.callsOf("fillRect")).toHaveLength(1);
    const draws = output!.rec.callsOf("drawImage");
    expect(draws.at(-2)?.args[0]).toBe(t.video);
    expect(draws.at(-1)?.args[0]).toBe(layer!.canvas);
    expect(progress).toContain(0.5);

    t.video.dispatchEvent(new Event("ended"));
    const blob = await promise;
    expect(blob.type).toBe("video/webm");
    expect(blob.size).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
    // état de lecture restauré, flux libérés
    expect(t.video).toMatchObject({ muted: true, loop: true, playbackRate: 1.5, currentTime: 1.5 });
    expect(t.track.stop).toHaveBeenCalled();
    expect(t.audioRelease).toHaveBeenCalled();
  });

  it("met l'enregistreur en pause avec la vidéo", async () => {
    const t = setup();
    const promise = recordAnnotatedVideo(t.asVideo, scene, {}, t.env);
    await flush();
    t.video.pause();
    expect(t.recorder().pause).toHaveBeenCalled();
    await t.video.play();
    expect(t.recorder().resume).toHaveBeenCalled();
    t.video.dispatchEvent(new Event("ended"));
    await promise;
  });

  it("annulable : rejette en AbortError et restaure la lecture", async () => {
    const t = setup();
    const controller = new AbortController();
    const promise = recordAnnotatedVideo(t.asVideo, scene, { signal: controller.signal }, t.env);
    await flush();
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(t.recorder().stop).toHaveBeenCalled();
    expect(t.video.currentTime).toBe(1.5);
  });

  it("refuse un second enregistrement simultané", async () => {
    const t = setup();
    const first = recordAnnotatedVideo(t.asVideo, scene, {}, t.env);
    await expect(recordAnnotatedVideo(t.asVideo, scene, {}, t.env)).rejects.toThrow(
      "Un enregistrement est déjà en cours.",
    );
    await flush();
    t.video.dispatchEvent(new Event("ended"));
    await first;
  });

  it("messages d'erreur d'origine : navigateur ou format non supporté", async () => {
    const t = setup([]);
    await expect(recordAnnotatedVideo(t.asVideo, scene, {}, null)).rejects.toThrow(
      UNSUPPORTED_MESSAGE,
    );
    await expect(recordAnnotatedVideo(t.asVideo, scene, {}, t.env)).rejects.toThrow(
      "Format d'enregistrement non supporté par ce navigateur.",
    );
  });
});
