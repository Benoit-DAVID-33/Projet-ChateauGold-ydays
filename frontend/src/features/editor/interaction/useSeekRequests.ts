/**
 * Applique au <video> les demandes de positionnement du store
 * (`requestSeek`, émis par la chronologie ou les calques), puis les acquitte.
 * Le retour vers le store passe par `useVideoTimeSync` (seeking / seeked).
 */
import { useEffect, type RefObject } from "react";

import { useEditorStore, type SeekRequest } from "../store/editorStore";

export function useSeekRequests(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;
    const apply = (request: SeekRequest | null) => {
      if (!request) return;
      try {
        video.currentTime = request.time;
      } catch {
        // Métadonnées pas encore chargées : la position sera celle par défaut.
      }
      useEditorStore.getState().consumeSeekRequest(request.id);
    };
    apply(useEditorStore.getState().seekRequest);
    return useEditorStore.subscribe((s, prev) => {
      if (s.seekRequest !== prev.seekRequest) apply(s.seekRequest);
    });
  }, [videoRef, enabled]);
}
