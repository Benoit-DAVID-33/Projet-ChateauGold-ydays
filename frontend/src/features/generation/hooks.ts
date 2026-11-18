import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Generation, GenerationIn } from "@/shared/api/client";
import { generationApi } from "@/shared/api/endpoints";

export const POLL_INTERVAL_MS = 5_000;
/** Au-delà, on arrête d'interroger (la tâche reste consultable dans l'historique). */
export const POLL_TIMEOUT_MS = 30 * 60_000;

export const isFinal = (generation: Generation | undefined) =>
  generation?.status === "succeeded" || generation?.status === "failed";

/**
 * Suivi d'une génération : React Query n'enchaîne la requête suivante qu'après
 * la réponse précédente (pas de chevauchement, contrairement au setInterval
 * d'origine) et s'arrête à l'état final ou après POLL_TIMEOUT_MS.
 */
export function useGeneration(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["generations", id],
    queryFn: async () => {
      const generation = await generationApi.get(id ?? "");
      if (isFinal(generation)) {
        void queryClient.invalidateQueries({ queryKey: ["media", "list"] });
        void queryClient.invalidateQueries({ queryKey: ["generations", "list"] });
      }
      return generation;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (isFinal(data)) return false;
      const started = data ? new Date(data.created_at).getTime() : Date.now();
      return Date.now() - started > POLL_TIMEOUT_MS ? false : POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
}

/**
 * État à jour d'une génération affichée dans un historique. Tant qu'elle n'est pas
 * terminée, sa route de suivi est interrogée : c'est elle qui rapatrie les résultats
 * dans la bibliothèque. Au-delà de POLL_TIMEOUT_MS, elle est vérifiée une fois à chaque
 * affichage, ce qui récupère aussi une génération quittée en cours de route.
 */
export function useLiveGeneration(generation: Generation): Generation {
  const live = useGeneration(isFinal(generation) ? null : generation.id);
  return live.data ?? generation;
}

export function useCreateGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GenerationIn) => generationApi.create(payload),
    onSuccess: (generation) => {
      queryClient.setQueryData(["generations", generation.id], generation);
      return queryClient.invalidateQueries({ queryKey: ["generations", "list"] });
    },
  });
}

/** Dernières générations, éventuellement limitées à celles d'un média source. */
export function useGenerationHistory(options: { sourceMediaId?: string; limit?: number } = {}) {
  const { sourceMediaId, limit = 50 } = options;
  return useQuery({
    queryKey: ["generations", "list", sourceMediaId ?? "all", limit],
    queryFn: () => generationApi.list({ sourceMediaId, limit }),
  });
}

/** Taille d'une page de l'historique de la bibliothèque. */
export const GENERATION_PAGE_SIZE = 20;

/** Historique paginé (« Charger plus »). */
export function useGenerationPages() {
  return useInfiniteQuery({
    queryKey: ["generations", "list", "pages"],
    queryFn: ({ pageParam }) =>
      generationApi.list({ limit: GENERATION_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < GENERATION_PAGE_SIZE ? undefined : pages.length * GENERATION_PAGE_SIZE,
  });
}

export const STATUS_LABELS: Record<Generation["status"], string> = {
  submitted: "Tâche envoyée, en attente…",
  processing: "Génération en cours…",
  succeeded: "Génération terminée",
  failed: "Échec de la génération",
};

export const KIND_LABELS: Record<Generation["kind"], string> = {
  text_to_image: "Texte vers image",
  text_to_video: "Texte vers vidéo",
  image_to_video: "Image vers vidéo",
  omni_video: "Omni-Video (transformation)",
};
