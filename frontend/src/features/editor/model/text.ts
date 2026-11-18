/**
 * Texte : police d'origine (Arial gras), contour noir.
 *
 * Contrat : (x, y) est le point de LIGNE DE BASE gauche (cf. types.ts). La boîte
 * de saisie est approchée par [y − 0,8·taille, y + 0,2·taille], soit une hauteur
 * égale à la taille de police comme dans l'original.
 */
import type { Rect } from "./geometry";
import type { TextElement } from "./types";

/** Mesure la largeur d'un texte pour une taille de police (pixels natifs). */
export type TextMeasurer = (text: string, fontSize: number) => number;

export const TEXT_ASCENT = 0.8;
export const TEXT_DESCENT = 0.2;

export const textFont = (fontSize: number): string => `bold ${fontSize}px Arial`;

/** Approximation (Arial gras ≈ 0,6 em par caractère) : repli sans canvas et tests. */
export const approximateTextWidth: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.6;

export function textBounds(el: TextElement, measure: TextMeasurer): Rect {
  return {
    x: el.x,
    y: el.y - TEXT_ASCENT * el.fontSize,
    width: Math.max(measure(el.text, el.fontSize), el.fontSize * 0.3),
    height: el.fontSize,
  };
}

/** Ligne de base correspondant à un haut de boîte donné. */
export const baselineFromTop = (top: number, fontSize: number): number =>
  top + TEXT_ASCENT * fontSize;
