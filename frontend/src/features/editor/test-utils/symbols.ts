/**
 * Plages de code interdites dans l'éditeur (règle produit : ni emoji ni
 * symbole décoratif) : flèches, symboles techniques, formes géométriques et
 * dingbats, flèches supplémentaires, formes diverses, sélecteur de variante
 * emoji, emojis. Exprimées en nombres pour que ce fichier reste lui-même propre.
 */
const FORBIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x2190, 0x21ff],
  [0x2300, 0x23ff],
  [0x25a0, 0x27bf],
  [0x27f0, 0x27ff],
  [0x2b00, 0x2bff],
  [0xfe0f, 0xfe0f],
  [0x1f000, 0x1faff],
];

/** Caractères interdits trouvés dans le texte (en notation U+XXXX). */
export function forbiddenSymbols(text: string): string[] {
  const found: string[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (FORBIDDEN_RANGES.some(([from, to]) => code >= from && code <= to)) {
      found.push(`U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }
  return found;
}
