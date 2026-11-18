import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaInfo } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { createRecordingContext } from "../test-utils/recordingContext";
import { shape } from "../test-utils/fixtures";
import { MediaEditor } from "./MediaEditor";
import { TimelinePanel } from "./TimelinePanel";

const store = () => useEditorStore.getState();
const VIDEO: MediaInfo = { kind: "video", name: "clip.mp4", width: 800, height: 600, duration: 10 };
const pointer = { isPrimary: true, button: 0, pointerId: 1 };

/** Zone de 0 à 500 px : 1 px = 0,02 s pour une vidéo de 10 s. */
function mockRect(el: Element) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 500, height: 20, right: 500, bottom: 20 }) as DOMRect;
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  store().reset("video");
  store().setMediaInfo(VIDEO);
});

describe("TimelinePanel", () => {
  it("ne rend rien pour une image", () => {
    store().reset("image");
    store().setMediaInfo({ kind: "image", name: "a.png", width: 10, height: 10 });
    const { container } = render(<TimelinePanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("règle graduée sur la durée ; clic = demande de seek", () => {
    render(<TimelinePanel />);
    expect(screen.getByText("0,0 s / 10,0 s")).toBeInTheDocument();
    expect(screen.getByText("10 s")).toBeInTheDocument();
    const ruler = screen.getByRole("slider", { name: "Position de lecture" });
    mockRect(ruler);
    fireEvent.pointerDown(ruler, { ...pointer, clientX: 125 });
    expect(store().seekRequest?.time).toBe(2.5);
    expect(store().currentTime).toBe(2.5);
    fireEvent.pointerMove(ruler, { ...pointer, clientX: 250 });
    expect(store().seekRequest?.time).toBe(5);
    fireEvent.pointerUp(ruler, pointer);
    fireEvent.keyDown(ruler, { key: "End" });
    expect(store().seekRequest?.time).toBe(10);
  });

  it("glisser le bord de fin : borné, une seule entrée d'historique", () => {
    store().addElement(shape({ id: "a", startTime: 2, endTime: 4 }), { select: false });
    render(<TimelinePanel />);
    const bar = screen.getByTestId("timeline-bar-a");
    mockRect(bar.parentElement!);
    const end = screen.getByRole("slider", { name: "Fin : Carré" });
    const before = store().history.past.length;
    fireEvent.pointerDown(end, { ...pointer, clientX: 200 });
    fireEvent.pointerMove(end, { ...pointer, clientX: 300 });
    fireEvent.pointerMove(end, { ...pointer, clientX: 350 });
    fireEvent.pointerUp(end, pointer);
    expect(store().elements[0]).toMatchObject({ startTime: 2, endTime: 7 });
    expect(store().history.past).toHaveLength(before + 1);
    expect(store().selectedId).toBe("a");

    fireEvent.pointerDown(end, { ...pointer, clientX: 350 });
    fireEvent.pointerMove(end, { ...pointer, clientX: 900 });
    fireEvent.pointerUp(end, pointer);
    expect(store().elements[0]?.endTime).toBeNull();
    expect(end).toHaveAttribute("aria-valuetext", "jusqu'à la fin");
  });

  it("bord de début borné par la fin, barre déplacée en bloc, clavier", () => {
    store().addElement(shape({ id: "a", startTime: 2, endTime: 4 }), { select: false });
    render(<TimelinePanel />);
    const bar = screen.getByTestId("timeline-bar-a");
    mockRect(bar.parentElement!);
    const start = screen.getByRole("slider", { name: "Début : Carré" });
    fireEvent.pointerDown(start, { ...pointer, clientX: 100 });
    fireEvent.pointerMove(start, { ...pointer, clientX: 480 });
    fireEvent.pointerUp(start, pointer);
    expect(store().elements[0]?.startTime).toBeCloseTo(3.9);

    act(() => store().setElementTiming("a", { startTime: 2, endTime: 4 }));
    fireEvent.pointerDown(bar, { ...pointer, clientX: 150 });
    fireEvent.pointerMove(bar, { ...pointer, clientX: 200 });
    fireEvent.pointerUp(bar, pointer);
    expect(store().elements[0]).toMatchObject({ startTime: 3, endTime: 5 });

    fireEvent.keyDown(start, { key: "ArrowLeft", shiftKey: true });
    expect(store().elements[0]?.startTime).toBe(2);
  });

  it("durée inconnue : message au lieu de la règle", () => {
    store().setMediaInfo({ ...VIDEO, duration: undefined });
    render(<TimelinePanel />);
    expect(screen.getByText(/chronologie indisponible/)).toBeInTheDocument();
  });
});

describe("MediaEditor applique les demandes de seek au lecteur", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => createRecordingContext().ctx as never,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("requestSeek positionne le <video> puis acquitte la demande", () => {
    const media = { id: "v", kind: "video", name: "clip.mp4", content_url: "/v.mp4" } as const;
    const { container } = render(<MediaEditor media={media} />);
    const video = container.querySelector("video")!;
    let position = 0;
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => position,
      set: (value: number) => {
        position = value;
      },
    });
    Object.defineProperty(video, "videoWidth", { value: 800, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 600, configurable: true });
    Object.defineProperty(video, "duration", { value: 10, configurable: true });
    fireEvent.loadedMetadata(video);
    act(() => store().requestSeek(6.5));
    expect(position).toBe(6.5);
    expect(store().seekRequest).toBeNull();
    expect(store().currentTime).toBe(6.5);
  });
});
