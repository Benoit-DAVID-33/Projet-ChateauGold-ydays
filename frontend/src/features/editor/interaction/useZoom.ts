/**
 * Zoom 0,5–5 par pas de 0,25 (zoom.js). Le zoom agrandit la SCÈNE (média +
 * calque ensemble) au lieu d'un `transform` sur le seul média : annotations
 * toujours alignées et défilement complet dans toutes les directions.
 * Le point sous le curseur (ou le centre visible) reste fixe pendant le zoom.
 */
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { ZOOM } from "../model/constants";
import { clamp } from "../model/geometry";
import type { Point } from "../model/types";
import { clientToNative, nativeToClient, type ViewMetrics } from "./coords";

interface Anchor {
  native: Point;
  client: Point;
}

const normalize = (level: number) =>
  clamp(Math.round(level / ZOOM.step) * ZOOM.step, ZOOM.min, ZOOM.max);

export function useZoom(
  viewportRef: RefObject<HTMLElement | null>,
  getMetrics: () => ViewMetrics | null,
) {
  const [zoom, setZoom] = useState(1);
  const anchorRef = useRef<Anchor | null>(null);

  const rememberAnchor = useCallback(
    (client?: Point) => {
      const metrics = getMetrics();
      const viewport = viewportRef.current?.getBoundingClientRect();
      const at =
        client ??
        (viewport && {
          x: viewport.left + viewport.width / 2,
          y: viewport.top + viewport.height / 2,
        });
      anchorRef.current =
        metrics && at ? { native: clientToNative(metrics, at.x, at.y), client: at } : null;
    },
    [getMetrics, viewportRef],
  );

  const zoomBy = useCallback(
    (steps: number, client?: Point) => {
      rememberAnchor(client);
      setZoom((z) => normalize(z + steps * ZOOM.step));
    },
    [rememberAnchor],
  );

  const resetZoom = useCallback(() => {
    anchorRef.current = null;
    setZoom(1);
  }, []);

  // Après la mise en page au nouveau zoom : recale le défilement sur l'ancre.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const viewport = viewportRef.current;
    const metrics = getMetrics();
    if (!anchor || !viewport || !metrics) return;
    const now = nativeToClient(metrics, anchor.native);
    viewport.scrollLeft += now.x - anchor.client.x;
    viewport.scrollTop += now.y - anchor.client.y;
  }, [zoom, viewportRef, getMetrics]);

  return { zoom, zoomBy, resetZoom };
}
