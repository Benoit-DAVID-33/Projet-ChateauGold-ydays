/** Doubles de test : médias, générations, API, horloge et hôte simulés. */
import { vi } from "vitest";

import type { AnnotationElement } from "@/features/editor/model/types";
import type { Generation, Media, Workflow } from "@/shared/api/client";

import type { ExecutionContext } from "../engine/types";
import type { WorkflowHost } from "../host";
import { abortError, type Clock, type WorkflowServices } from "../services";

let counter = 0;

export function makeMedia(overrides: Partial<Media> = {}): Media {
  counter += 1;
  const id = overrides.id ?? `media-${counter}`;
  return {
    id,
    kind: "image",
    source: "upload",
    name: `${id}.png`,
    content_type: "image/png",
    size_bytes: 1000,
    created_at: "2026-10-30T12:00:00Z",
    parent_id: null,
    content_url: `/api/media/${id}/content`,
    ...overrides,
  };
}

export function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-1",
    kind: "text_to_image",
    status: "submitted",
    prompt: "",
    parameters: {},
    source_media_id: null,
    error_message: null,
    result_media_ids: [],
    created_at: "2026-10-30T12:00:00Z",
    updated_at: "2026-10-30T12:00:00Z",
    ...overrides,
  };
}

export function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf-1",
    name: "Mon workflow",
    created_at: "2026-10-30T12:00:00Z",
    updated_at: "2026-10-30T12:00:00Z",
    graph: { version: 1, nodes: [], edges: [] },
    ...overrides,
  };
}

const notMocked = (name: string) => () => Promise.reject(new Error(`${name} non simulé`));

/** API entièrement simulée : chaque méthode est un vi.fn() à configurer. */
export function fakeServices() {
  return {
    media: {
      list: vi.fn<WorkflowServices["media"]["list"]>(notMocked("media.list")),
      get: vi.fn<WorkflowServices["media"]["get"]>(notMocked("media.get")),
      process: vi.fn<WorkflowServices["media"]["process"]>(notMocked("media.process")),
    },
    generation: {
      create: vi.fn<WorkflowServices["generation"]["create"]>(notMocked("generation.create")),
      get: vi.fn<WorkflowServices["generation"]["get"]>(notMocked("generation.get")),
    },
    workflows: {
      list: vi.fn<WorkflowServices["workflows"]["list"]>(notMocked("workflows.list")),
      get: vi.fn<WorkflowServices["workflows"]["get"]>(notMocked("workflows.get")),
      create: vi.fn<WorkflowServices["workflows"]["create"]>(notMocked("workflows.create")),
      update: vi.fn<WorkflowServices["workflows"]["update"]>(notMocked("workflows.update")),
      remove: vi.fn<WorkflowServices["workflows"]["remove"]>(notMocked("workflows.remove")),
    },
  } satisfies WorkflowServices;
}

export type FakeServices = ReturnType<typeof fakeServices>;

/** Horloge virtuelle : `sleep` avance le temps immédiatement (ou échoue si annulé). */
export function fakeClock(start = 1_000_000) {
  const clock = {
    time: start,
    sleeps: [] as number[],
    now: () => clock.time,
    sleep: (ms: number, signal: AbortSignal) => {
      if (signal.aborted) return Promise.reject(abortError());
      clock.sleeps.push(ms);
      clock.time += ms;
      return Promise.resolve();
    },
  };
  return clock satisfies Clock;
}

/** Horloge dont `sleep` ne se termine qu'à l'annulation (pour tester l'arrêt). */
export function blockingClock(): Clock {
  return {
    now: () => 0,
    sleep: (_ms, signal) =>
      new Promise<void>((_resolve, reject) => {
        if (signal.aborted) reject(abortError());
        signal.addEventListener("abort", () => reject(abortError()), { once: true });
      }),
  };
}

export const SQUARE: AnnotationElement = {
  id: "el-1",
  type: "shape",
  shape: "square",
  color: "#FFD700",
  strokeWidth: 4,
  startTime: 0,
  endTime: null,
  motionTracking: false,
  x: 100,
  y: 100,
  width: 200,
  height: 100,
};

export function fakeHost(overrides: Partial<WorkflowHost> = {}): WorkflowHost {
  const media = makeMedia({ id: "atelier-media", kind: "video", name: "clip.mp4" });
  return {
    media,
    elements: [SQUARE],
    mediaInfo: { kind: media.kind, name: media.name, width: 1920, height: 1080, duration: 10 },
    exportAnnotatedImage: vi.fn(async () => makeMedia({ id: "annotated", name: "annotee.png" })),
    ...overrides,
  };
}

export function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  const controller = new AbortController();
  return {
    host: null,
    api: fakeServices(),
    signal: controller.signal,
    clock: fakeClock(),
    reportProgress: vi.fn(),
    ...overrides,
  };
}
