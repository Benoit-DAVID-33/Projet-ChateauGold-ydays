/**
 * Mise en forme des nombres, durées, couleurs et fenêtres temporelles
 * (français pour la description, anglais pour le prompt complet).
 */
import type { ResolvedMedia, TimeWindow } from "./types";

/** `toFixed` sans « -0.0 » pour les petites valeurs négatives arrondies à zéro. */
export function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

/** Pourcentage affiché avec une décimale (« 12.5 »), comme la version d'origine. */
export function formatPercent(value: number): string {
  return fixed(value, 1);
}

/** Durée en secondes, format français : « 2,0 s ». */
export function formatSecondsFr(seconds: number): string {
  return `${fixed(seconds, 1).replace(".", ",")} s`;
}

/** Durée en secondes, format anglais : « 2.0s ». */
export function formatSecondsEn(seconds: number): string {
  return `${fixed(seconds, 1)}s`;
}

/** « Visible: … » en français, ou null pour une image (pas de fenêtre). */
export function formatTimingFr(timing: TimeWindow | null): string | null {
  if (!timing) return null;
  const { startTime, endTime } = timing;
  if (endTime === null) {
    return startTime === 0
      ? "Visible: pendant toute la vidéo"
      : `Visible: de ${formatSecondsFr(startTime)} jusqu'à la fin`;
  }
  return `Visible: de ${formatSecondsFr(startTime)} à ${formatSecondsFr(endTime)}`;
}

/** « Visible: … » en anglais, ou null pour une image. */
export function formatTimingEn(timing: TimeWindow | null): string | null {
  if (!timing) return null;
  const { startTime, endTime } = timing;
  if (endTime === null) {
    return startTime === 0
      ? "Visible: during the whole video"
      : `Visible: from ${formatSecondsEn(startTime)} until the end`;
  }
  return `Visible: from ${formatSecondsEn(startTime)} to ${formatSecondsEn(endTime)}`;
}

/** Noms des 19 teintes de la palette de dessin (français / anglais). */
const COLOR_NAMES: Record<string, { fr: string; en: string }> = {
  "#000000": { fr: "noir", en: "black" },
  "#FFFFFF": { fr: "blanc", en: "white" },
  "#FF0000": { fr: "rouge", en: "red" },
  "#00FF00": { fr: "vert vif", en: "lime green" },
  "#0000FF": { fr: "bleu", en: "blue" },
  "#FFFF00": { fr: "jaune", en: "yellow" },
  "#FF00FF": { fr: "magenta", en: "magenta" },
  "#00FFFF": { fr: "cyan", en: "cyan" },
  "#FFD700": { fr: "or", en: "gold" },
  "#FFA500": { fr: "orange", en: "orange" },
  "#800080": { fr: "violet", en: "purple" },
  "#FFC0CB": { fr: "rose", en: "pink" },
  "#A52A2A": { fr: "marron", en: "brown" },
  "#808080": { fr: "gris", en: "gray" },
  "#008000": { fr: "vert", en: "green" },
  "#000080": { fr: "bleu marine", en: "navy blue" },
  "#800000": { fr: "bordeaux", en: "maroon" },
  "#C0C0C0": { fr: "argent", en: "silver" },
  "#FF6347": { fr: "rouge tomate", en: "tomato red" },
};

/**
 * Normalise une couleur : hex en majuscules, forme courte (#abc) développée.
 * Toute autre notation (rgb(), nom CSS) est conservée telle quelle.
 */
export function normalizeColor(color: string): string {
  const value = color.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) {
    const [, r = "", g = "", b = ""] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : value;
}

/** Nom de la couleur (palette) dans la langue demandée, sinon null. */
export function colorName(color: string, lang: "fr" | "en"): string | null {
  return COLOR_NAMES[normalizeColor(color)]?.[lang] ?? null;
}

/** « or (#FFD700) » / « gold (#FFD700) », ou le hex seul hors palette. */
export function formatColor(color: string, lang: "fr" | "en"): string {
  const normalized = normalizeColor(color);
  if (!normalized) return lang === "fr" ? "non définie" : "Default";
  const name = colorName(normalized, lang);
  return name ? `${name} (${normalized})` : normalized;
}

/** Désignation du média dans les phrases françaises. */
export function mediaNounFr(media: ResolvedMedia): string {
  return media.kind === "video" ? "la vidéo" : "l'image";
}
