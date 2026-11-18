import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MediaEditorHandle } from "@/features/editor";
import type { MediaOperations } from "@/features/workspace/useMediaOperations";
import type { Generation, Media } from "@/shared/api/client";
import { mockFetch, renderWithProviders, TEST_USER } from "@/test/utils";

import { Atelier } from "./Atelier";
import type { AtelierOutput } from "../model/outputs";

const VIDEO: Media = {
  id: "22222222-2222-2222-2222-222222222222",
  kind: "video",
  source: "upload",
  name: "clip.mp4",
  content_type: "video/mp4",
  size_bytes: 1000,
  created_at: "2026-10-30T12:00:00Z",
  parent_id: null,
  content_url: "/api/media/2/content",
};
const IMAGE: Media = { ...VIDEO, id: "33333333-3333-3333-3333-333333333333", kind: "image" };

const operations: MediaOperations = {
  busy: false,
  status: null,
  recording: false,
  cancelRecording: vi.fn(),
  saveAnnotatedImage: vi.fn(),
  sendToApi: vi.fn(() => Promise.resolve()),
  downloadImage: vi.fn(() => Promise.resolve()),
  saveImageToLibrary: vi.fn(() => Promise.resolve()),
  exportVideo: vi.fn(() => Promise.resolve()),
};

const generation = (over: Partial<Generation>): Generation => ({
  id: "g1",
  kind: "text_to_image",
  status: "submitted",
  prompt: "un phare",
  parameters: {},
  source_media_id: null,
  error_message: null,
  result_media_ids: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});

function Harness({ media, pageKind }: { media: Media | null; pageKind: "image" | "video" }) {
  const [outputs, setOutputs] = useState<AtelierOutput[]>([]);
  return (
    <Atelier
      media={media}
      pageKind={pageKind}
      editorRef={createRef<MediaEditorHandle>()}
      operations={operations}
      outputs={outputs}
      onOutput={(o) => setOutputs((list) => [o, ...list])}
      onUploaded={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

const postedGeneration = (fetch: ReturnType<typeof mockFetch>) => {
  const call = fetch.mock.calls.find(
    ([url, init]) => url === "/api/generations" && (init as RequestInit)?.method === "POST",
  );
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
};

afterEach(() => vi.unstubAllGlobals());

describe("Atelier", () => {
  it("sans média : seules les générations à partir du texte sont disponibles", () => {
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: /^\/api\/generations\?/, body: [] },
      { path: /\/api\/media/, body: [] },
    ]);
    renderWithProviders(<Harness media={null} pageKind="image" />);

    const tabs = screen.getByRole("tablist", { name: "Mode de l'Atelier" });
    expect(within(tabs).getByRole("tab", { name: "Annoter" })).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: "Image vers vidéo" })).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: "Omni-Video" })).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: "Texte vers image" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: /charger une image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Générer" })).toBeDisabled();
    expect(screen.getByText("Saisissez un prompt.")).toBeInTheDocument();
  });

  it("texte vers image : envoie le prompt et les paramètres, puis suit la génération", async () => {
    document.cookie = "goldfx_csrf=t; path=/";
    const fetch = mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: /^\/api\/generations\?/, body: [] },
      { path: /\/api\/media/, body: [] },
      { method: "POST", path: "/api/generations", status: 201, body: generation({}) },
      { path: /\/api\/generations\/g1$/, body: generation({ status: "processing" }) },
    ]);
    renderWithProviders(<Harness media={null} pageKind="image" />);

    await userEvent.type(screen.getByLabelText("Prompt"), "un phare");
    await userEvent.selectOptions(screen.getByLabelText("Format"), "1:1");
    await userEvent.clear(screen.getByLabelText("Nombre d'images"));
    await userEvent.type(screen.getByLabelText("Nombre d'images"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Générer" }));

    await waitFor(() => expect(postedGeneration(fetch)).toBeTruthy());
    expect(postedGeneration(fetch)).toMatchObject({
      kind: "text_to_image",
      prompt: "un phare",
      aspect_ratio: "1:1",
      count: 4,
      source_media_id: null,
    });
    const outputs = await screen.findByRole("list", { name: "Sorties" });
    expect(await within(outputs).findByText(/génération en cours/i)).toBeInTheDocument();
  });

  it("vidéo ouverte : Omni-Video transforme la source en qualité Pro", async () => {
    document.cookie = "goldfx_csrf=t; path=/";
    const fetch = mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: /^\/api\/generations\?/, body: [] },
      { path: /\/api\/media/, body: [] },
      {
        method: "POST",
        path: "/api/generations",
        status: 201,
        body: generation({ kind: "omni_video", source_media_id: VIDEO.id }),
      },
      { path: /\/api\/generations\/g1$/, body: generation({ kind: "omni_video" }) },
    ]);
    renderWithProviders(<Harness media={VIDEO} pageKind="video" />);

    expect(screen.getByRole("tab", { name: "Annoter" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Envoyer à l'API" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Omni-Video" }));
    // En transformation, durée et format suivent la vidéo source : champs masqués.
    expect(screen.queryByLabelText("Durée")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Prompt"), "style film noir");
    await userEvent.click(screen.getByRole("button", { name: "Générer" }));
    await waitFor(() => expect(postedGeneration(fetch)).toBeTruthy());
    expect(postedGeneration(fetch)).toMatchObject({
      kind: "omni_video",
      prompt: "style film noir",
      mode: "pro",
      refer_type: "base",
      source_media_id: VIDEO.id,
      aspect_ratio: null,
    });
  });

  it("image vers vidéo : le prompt est facultatif", async () => {
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: /^\/api\/generations\?/, body: [] },
      { path: /\/api\/media/, body: [] },
    ]);
    renderWithProviders(<Harness media={IMAGE} pageKind="image" />);
    await userEvent.click(screen.getByRole("tab", { name: "Image vers vidéo" }));
    expect(screen.getByRole("button", { name: "Générer" })).toBeEnabled();
  });

  it("historique : une génération en cours est suivie jusqu'à son résultat", async () => {
    const fetch = mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      {
        path: /^\/api\/generations\?/,
        body: [generation({ id: "pending", status: "processing", source_media_id: IMAGE.id })],
      },
      {
        path: /\/api\/generations\/pending$/,
        body: generation({
          id: "pending",
          status: "succeeded",
          source_media_id: IMAGE.id,
          result_media_ids: ["r1"],
        }),
      },
      { path: /\/api\/media/, body: [] },
    ]);
    renderWithProviders(<Harness media={IMAGE} pageKind="image" />);
    expect(await screen.findByText("Génération terminée")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Résultat 1" })).toHaveAttribute("href", "/image/r1");
    expect(screen.getByRole("button", { name: "Supprimer l'image" })).toBeInTheDocument();
    // L'historique est filtré par l'API sur le média ouvert.
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`/api/generations?limit=10&source_media_id=${IMAGE.id}`);
    expect(urls).toContain(`/api/media?limit=50&parent_id=${IMAGE.id}`);
  });

  it("mode Annoter : « Envoyer à l'API » transmet le prompt composé", async () => {
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: /^\/api\/generations\?/, body: [] },
      { path: /\/api\/media/, body: [] },
    ]);
    renderWithProviders(<Harness media={IMAGE} pageKind="image" />);
    await userEvent.type(screen.getByLabelText("Prompt"), "ajouter un halo");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer à l'API" }));
    expect(operations.sendToApi).toHaveBeenCalledWith("ajouter un halo");
  });

  it("historique : « Réutiliser » recharge le mode, le prompt et les paramètres", async () => {
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      {
        path: /^\/api\/generations\?/,
        body: [
          generation({
            id: "old",
            kind: "text_to_video",
            status: "succeeded",
            prompt: "un orage sur la mer",
            parameters: { negative_prompt: "flou", duration: "10", mode: "pro" },
          }),
        ],
      },
      { path: /\/api\/media/, body: [] },
    ]);
    renderWithProviders(<Harness media={null} pageKind="image" />);

    await userEvent.click(
      await screen.findByRole("button", { name: /réutiliser le prompt et les paramètres/i }),
    );
    expect(screen.getByRole("tab", { name: "Texte vers vidéo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("un orage sur la mer");
    expect(screen.getByLabelText("Prompt négatif")).toHaveValue("flou");
    expect(screen.getByLabelText("Durée")).toHaveValue("10");
    expect(screen.getByLabelText("Qualité")).toHaveValue("pro");
  });
});
