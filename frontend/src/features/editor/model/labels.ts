/** Libellés français des éléments et des durées (calques, chronologie, statut d'outil). */
import {
  LINE_LABELS,
  SHAPE3D_LABELS,
  SHAPE_LABELS,
  type AnnotationElement,
  type StrokeTool,
} from "./types";

export const STROKE_LABELS: Record<StrokeTool, string> = {
  pencil: "Crayon",
  marker: "Feutre",
  eraser: "Gomme",
};

const TEXT_PREVIEW_LENGTH = 24;

export function elementLabel(el: AnnotationElement): string {
  switch (el.type) {
    case "shape":
      return SHAPE_LABELS[el.shape];
    case "shape3d":
      return SHAPE3D_LABELS[el.shape];
    case "line":
      return LINE_LABELS[el.line];
    case "stroke":
      return STROKE_LABELS[el.tool];
    case "text": {
      const preview =
        el.text.length > TEXT_PREVIEW_LENGTH
          ? `${el.text.slice(0, TEXT_PREVIEW_LENGTH - 1)}…`
          : el.text;
      return `Texte « ${preview} »`;
    }
  }
}

const SECONDS = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** « 2,0 s » */
export const formatSeconds = (t: number): string => `${SECONDS.format(t)} s`;

/** « 2,0 s à 5,3 s » ou « 2,0 s jusqu'à la fin ». */
export function timeWindowLabel(el: Pick<AnnotationElement, "startTime" | "endTime">): string {
  return el.endTime === null
    ? `${formatSeconds(el.startTime)} jusqu'à la fin`
    : `${formatSeconds(el.startTime)} à ${formatSeconds(el.endTime)}`;
}

const TICK = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Repère de graduation : « 5 s », « 0,5 s », « 1 min 30 ». */
export function formatTick(t: number): string {
  if (t < 60) return `${TICK.format(t)} s`;
  const minutes = Math.floor(t / 60);
  const seconds = Math.round(t - minutes * 60);
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${String(seconds).padStart(2, "0")}`;
}
