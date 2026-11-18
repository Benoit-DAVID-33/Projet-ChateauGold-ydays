/**
 * Géométrie de l'Assistant IA : résolution du média, boîtes englobantes en
 * pixels natifs, pourcentages, zones 3×3, catégories de taille et visibilité.
 *
 * Corrections par rapport à la version d'origine :
 * - les coordonnées du modèle sont déjà en pixels NATIFS : les pourcentages
 *   sont exacts quel que soit le zoom d'affichage ;
 * - la zone est calculée sur le CENTRE de l'élément (et non son coin
 *   haut-gauche).
 */
import type { AnnotationElement, MediaInfo, Point } from "@/features/editor/model/types";

import type { ResolvedMedia, SizeCategory, TimeWindow, Zone } from "./types";

/** Repli historique quand les dimensions du média sont inconnues. */
export const DEFAULT_MEDIA_WIDTH = 1280;
export const DEFAULT_MEDIA_HEIGHT = 720;

/**
 * Approximation de la boîte d'un texte (pas de mesure de police hors DOM) :
 * largeur moyenne d'un glyphe ≈ 0,6 × taille, jambage haut ≈ 0,8 × taille.
 */
export const TEXT_CHAR_WIDTH_RATIO = 0.6;
export const TEXT_ASCENT_RATIO = 0.8;

function positiveNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Applique les valeurs par défaut (image 1280×720) à un `MediaInfo` éventuel. */
export function resolveMedia(mediaInfo: MediaInfo | null | undefined): ResolvedMedia {
  const kind = mediaInfo?.kind === "video" ? "video" : "image";
  return {
    kind,
    name: mediaInfo?.name ?? "",
    width: positiveNumber(mediaInfo?.width) ?? DEFAULT_MEDIA_WIDTH,
    height: positiveNumber(mediaInfo?.height) ?? DEFAULT_MEDIA_HEIGHT,
    duration: kind === "video" ? positiveNumber(mediaInfo?.duration) : null,
  };
}

/** Rapport en pourcentage arrondi à 0,1 (même arrondi que `toFixed(1)` d'origine). */
export function toPercent(value: number, dimension: number): number {
  const rounded = Number(((value / dimension) * 100).toFixed(1));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Grille 3×3 [ligne][colonne] ; « Centre-Centre » s'écrit « Centre ». */
const ZONE_GRID = [
  ["Haut-Gauche", "Haut-Centre", "Haut-Droite"],
  ["Centre-Gauche", "Centre", "Centre-Droite"],
  ["Bas-Gauche", "Bas-Centre", "Bas-Droite"],
] as const satisfies readonly (readonly Zone[])[];

function gridIndex(percent: number): 0 | 1 | 2 {
  if (percent < 33) return 0;
  return percent > 66 ? 2 : 1;
}

/**
 * Zone de la grille 3×3 : < 33 donne Haut/Gauche, > 66 donne Bas/Droite, sinon Centre
 * (bornes 33 et 66 incluses dans Centre). Libellés identiques à l'origine.
 */
export function positionZone(percentX: number, percentY: number): Zone {
  return ZONE_GRID[gridIndex(percentY)][gridIndex(percentX)];
}

/** Catégorie de taille selon la moyenne (largeur % + hauteur %) / 2. */
export function sizeCategory(widthPercent: number, heightPercent: number): SizeCategory {
  const size = (widthPercent + heightPercent) / 2;
  if (size < 10) return "Très petit";
  if (size < 20) return "Petit";
  if (size < 40) return "Moyen";
  if (size < 60) return "Grand";
  return "Très grand";
}

/** Boîte englobante en pixels natifs. */
export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxFromPoints(points: readonly Point[]): PixelBox {
  const first = points[0];
  if (!first) return { left: 0, top: 0, width: 0, height: 0 };
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/** Contenu d'un texte sur une seule ligne (espaces blancs normalisés). */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Boîte englobante d'un élément en pixels natifs. Les dimensions négatives
 * (tracé de droite à gauche) sont normalisées.
 */
export function elementBox(element: AnnotationElement): PixelBox {
  switch (element.type) {
    case "shape":
    case "shape3d":
      return {
        left: Math.min(element.x, element.x + element.width),
        top: Math.min(element.y, element.y + element.height),
        width: Math.abs(element.width),
        height: Math.abs(element.height),
      };
    case "line":
      return boxFromPoints([element.start, element.end]);
    case "stroke":
      return boxFromPoints(element.points);
    case "text": {
      // (x, y) = ligne de base gauche : la boîte remonte du jambage haut.
      const length = [...normalizeText(element.text)].length;
      return {
        left: element.x,
        top: element.y - element.fontSize * TEXT_ASCENT_RATIO,
        width: element.fontSize * TEXT_CHAR_WIDTH_RATIO * length,
        height: element.fontSize,
      };
    }
  }
}

/** Centre de la boîte englobante. */
export function boxCenter(box: PixelBox): Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * Fenêtre d'apparition normalisée pour une vidéo (null pour une image) :
 * début borné à 0, fin au-delà de la durée connue = « jusqu'à la fin ».
 */
export function timeWindow(element: AnnotationElement, media: ResolvedMedia): TimeWindow | null {
  if (media.kind !== "video") return null;
  const startTime = Math.max(0, finiteOr(element.startTime, 0));
  const { endTime } = element;
  const reachesEnd =
    endTime === null ||
    !Number.isFinite(endTime) ||
    (media.duration !== null && endTime >= media.duration);
  return { startTime, endTime: reachesEnd ? null : endTime };
}

/**
 * L'élément est-il visible à un moment donné ? Exclut les fenêtres vides
 * (endTime <= startTime : élément « supprimé » d'une vidéo), les éléments qui
 * n'apparaissent qu'après la fin d'une vidéo de durée connue, les textes vides
 * et les tracés sans point.
 */
export function isEverVisible(element: AnnotationElement, media: ResolvedMedia): boolean {
  const start = finiteOr(element.startTime, 0);
  if (element.endTime !== null && element.endTime <= start) return false;
  if (media.kind === "video" && media.duration !== null && start >= media.duration) return false;
  if (element.type === "text" && normalizeText(element.text) === "") return false;
  if (element.type === "stroke" && element.points.length === 0) return false;
  return true;
}
