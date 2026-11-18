import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { flattenPages, MEDIA_PAGE_SIZE } from "@/features/media/hooks";
import type { Media } from "@/shared/api/client";
import { mockFetch, renderWithProviders, TEST_USER } from "@/test/utils";

import LibraryPage from "./LibraryPage";

const media = (index: number): Media => ({
  id: `m-${index}`,
  kind: "image",
  source: "upload",
  name: `photo-${index}.png`,
  content_type: "image/png",
  size_bytes: 1000,
  created_at: "2026-11-18T10:00:00Z",
  parent_id: null,
  content_url: `/api/media/m-${index}/content`,
});

afterEach(() => vi.unstubAllGlobals());

describe("Bibliothèque", () => {
  it("charge les médias page par page", async () => {
    const firstPage = Array.from({ length: MEDIA_PAGE_SIZE }, (_, i) => media(i));
    const fetch = mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: `/api/media?limit=${MEDIA_PAGE_SIZE}`, body: firstPage },
      { path: `/api/media?limit=${MEDIA_PAGE_SIZE}&offset=${MEDIA_PAGE_SIZE}`, body: [media(48)] },
      { path: /^\/api\/generations\?/, body: [] },
    ]);
    renderWithProviders(<LibraryPage />);

    expect(await screen.findByText("photo-0.png")).toBeInTheDocument();
    expect(screen.queryByText("photo-48.png")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Charger plus de médias" }));

    expect(await screen.findByText("photo-48.png")).toBeInTheDocument();
    // Page incomplète : plus rien à charger.
    expect(
      screen.queryByRole("button", { name: "Charger plus de médias" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(MEDIA_PAGE_SIZE + 1);
    expect(fetch.mock.calls.map(([url]) => String(url))).toContain(
      `/api/media?limit=${MEDIA_PAGE_SIZE}&offset=${MEDIA_PAGE_SIZE}`,
    );
  });

  it("filtre par type", async () => {
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: `/api/media?limit=${MEDIA_PAGE_SIZE}`, body: [media(1)] },
      { path: `/api/media?kind=video&limit=${MEDIA_PAGE_SIZE}`, body: [] },
      { path: /^\/api\/generations\?/, body: [] },
    ]);
    renderWithProviders(<LibraryPage />);
    expect(await screen.findByText("photo-1.png")).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("tablist", { name: "Filtrer par type" })).getByRole("tab", {
        name: "Vidéos",
      }),
    );
    expect(await screen.findByText("Aucun média pour l'instant")).toBeInTheDocument();
  });
});

describe("flattenPages", () => {
  it("supprime les doublons dus au décalage des pages", () => {
    expect(
      flattenPages([
        [media(1), media(2)],
        [media(2), media(3)],
      ]).map((m) => m.id),
    ).toEqual(["m-1", "m-2", "m-3"]);
    expect(flattenPages(undefined)).toEqual([]);
  });
});
