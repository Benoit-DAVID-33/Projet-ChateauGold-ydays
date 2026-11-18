/**
 * Taille d'affichage « ajustée » (zoom 100 %) du média : jamais agrandi au-delà
 * de sa taille native (comme l'original), limité par la largeur disponible et
 * par `--editor-max-height`. Mesures par ResizeObserver :
 * - largeur : racine de l'éditeur (indépendante des barres de défilement) ;
 * - hauteur : sonde `position: fixed` de hauteur `var(--editor-max-height)`.
 */
import { useEffect, useMemo, useState, type RefObject } from "react";

import type { MediaInfo } from "../../model/types";

export interface Size {
  width: number;
  height: number;
}

export function computeFitSize(info: MediaInfo | null, available: Size | null): Size | null {
  if (!info || info.width <= 0 || info.height <= 0) return null;
  if (!available || available.width <= 0) return { width: info.width, height: info.height };
  const byHeight = available.height > 0 ? available.height / info.height : Infinity;
  const scale = Math.min(1, available.width / info.width, byHeight);
  return { width: info.width * scale, height: info.height * scale };
}

function horizontalInset(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  return (
    (parseFloat(cs.paddingLeft) || 0) +
    (parseFloat(cs.paddingRight) || 0) +
    (parseFloat(cs.borderLeftWidth) || 0) +
    (parseFloat(cs.borderRightWidth) || 0)
  );
}

export function useFitSize(
  rootRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  probeRef: RefObject<HTMLElement | null>,
  info: MediaInfo | null,
): Size | null {
  const [available, setAvailable] = useState<Size | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const probe = probeRef.current;
    if (!root || !viewport || !probe || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = Math.max(0, root.clientWidth - horizontalInset(viewport));
      const height = probe.clientHeight;
      setAvailable((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [rootRef, viewportRef, probeRef]);

  // Tant que la première mesure n'est pas arrivée, la mise en page CSS (max-width /
  // max-height) s'applique : évite un flash du média à sa taille native.
  const measuring = available === null && typeof ResizeObserver !== "undefined";
  return useMemo(
    () => (measuring ? null : computeFitSize(info, available)),
    [measuring, info, available],
  );
}
