import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Media, MediaKind } from "@/shared/api/client";
import { mediaApi } from "@/shared/api/endpoints";

export const mediaKeys = {
  all: ["media"] as const,
  list: (kind?: MediaKind) => ["media", "list", kind ?? "all"] as const,
  detail: (id: string) => ["media", "detail", id] as const,
};

/** Taille d'une page de la bibliothèque. */
export const MEDIA_PAGE_SIZE = 48;

/** Les `limit` médias les plus récents (toutes les listes sont invalidées ensemble). */
export function useMediaList(kind?: MediaKind, limit = 200) {
  return useQuery({
    queryKey: [...mediaKeys.list(kind), limit],
    queryFn: () => mediaApi.list(kind, { limit }),
  });
}

/** Dérivés d'un média (exports, résultats de traitement et de génération). */
export function useDerivedMedia(parentId: string | undefined) {
  return useQuery({
    queryKey: ["media", "list", "derived", parentId ?? ""],
    queryFn: () => mediaApi.list(undefined, { parentId, limit: 50 }),
    enabled: Boolean(parentId),
  });
}

/** Bibliothèque paginée (« Charger plus »). */
export function useMediaPages(kind?: MediaKind) {
  return useInfiniteQuery({
    queryKey: ["media", "list", "pages", kind ?? "all"],
    queryFn: ({ pageParam }) => mediaApi.list(kind, { limit: MEDIA_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < MEDIA_PAGE_SIZE ? undefined : pages.length * MEDIA_PAGE_SIZE,
  });
}

/** Aplatit des pages en supprimant les doublons (un ajout décale les pages suivantes). */
export function flattenPages<T extends { id: string }>(pages: T[][] | undefined): T[] {
  const seen = new Set<string>();
  return (pages ?? []).flat().filter((item) => !seen.has(item.id) && seen.add(item.id));
}

export function useMedia(id: string | undefined) {
  return useQuery({
    queryKey: mediaKeys.detail(id ?? ""),
    queryFn: () => mediaApi.get(id ?? ""),
    enabled: Boolean(id),
  });
}

/** Invalide la bibliothèque après toute création / suppression. */
export function useInvalidateMedia() {
  const queryClient = useQueryClient();
  return (media?: Media) => {
    if (media) queryClient.setQueryData(mediaKeys.detail(media.id), media);
    return queryClient.invalidateQueries({ queryKey: ["media", "list"] });
  };
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: mediaKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: ["media", "list"] });
    },
  });
}

export const SOURCE_LABELS: Record<Media["source"], string> = {
  upload: "Original",
  processed: "Traité par l'API",
  generated: "Généré par Kling",
  export: "Export annoté",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function mediaRoute(media: Pick<Media, "id" | "kind">): string {
  return `/${media.kind}/${media.id}`;
}
