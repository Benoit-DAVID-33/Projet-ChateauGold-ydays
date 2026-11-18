/** Utilitaires de couleur pour le rendu des annotations (couleurs hex de la palette). */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
/** Or d'origine (#FFD700 = DEFAULT_COLOR), utilisé si la couleur est invalide. */
const GOLD: Rgb = { r: 255, g: 215, b: 0 };

/** Convertit `#rgb` / `#rrggbb` en composantes ; or par défaut si invalide. */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return GOLD;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Mélange linéaire de deux couleurs (t = 0 donne a, t = 1 donne b), arrondi à l'entier. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  return { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b) };
}

export function rgbaString({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `rgba(...)` d'une couleur hex : `rgba("#FFD700", 0.55)` donne `rgba(255, 215, 0, 0.55)`. */
export function rgba(hex: string, alpha: number): string {
  return rgbaString(parseHex(hex), alpha);
}

export const lighten = (hex: string, t: number): Rgb => mixRgb(parseHex(hex), WHITE, t);
export const darken = (hex: string, t: number): Rgb => mixRgb(parseHex(hex), BLACK, t);
