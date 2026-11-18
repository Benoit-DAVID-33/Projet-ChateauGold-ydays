/**
 * Détection des emoji et symboles décoratifs interdits dans tout texte visible
 * ou envoyé. Plages en points de code : un échappement \u serait réécrit en
 * caractère littéral par Prettier.
 */
const FORBIDDEN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x2190, 0x21ff], // flèches
  [0x2300, 0x23ff], // symboles techniques (sablier…)
  [0x25a0, 0x27bf], // formes, symboles divers, dingbats (coches, croix…)
  [0x27f0, 0x27ff], // flèches supplémentaires
  [0x2b00, 0x2bff], // symboles et flèches divers
  [0xfe0f, 0xfe0f], // sélecteur de variante emoji
  [0x1f000, 0x1faff], // emoji
];

/** Premier symbole interdit trouvé (« U+XXXX »), ou null. */
export function forbiddenSymbol(text: string): string | null {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (FORBIDDEN_RANGES.some(([from, to]) => code >= from && code <= to)) {
      return `U+${code.toString(16).toUpperCase()}`;
    }
  }
  return null;
}

/** Tout le texte visible du document : contenu, valeurs et indications de saisie. */
export function visibleText(root: ParentNode = document.body): string {
  const fields = Array.from(root.querySelectorAll("textarea, input"));
  return [
    root.textContent ?? "",
    ...fields.map((field) => (field as HTMLInputElement).value),
    ...fields.map((field) => field.getAttribute("placeholder") ?? ""),
  ].join("\n");
}
