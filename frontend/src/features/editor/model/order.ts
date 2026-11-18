/** Ordre d'empilement (z-order) : dernier élément du tableau = dessiné au-dessus. */
import type { AnnotationElement } from "./types";

/**
 * Déplace un élément d'un cran dans la pile : `+1` = vers l'avant (au-dessus),
 * `-1` = vers l'arrière. Renvoie le même tableau si le déplacement est impossible.
 */
export function moveInStack(
  elements: AnnotationElement[],
  id: string,
  step: 1 | -1,
): AnnotationElement[] {
  const from = elements.findIndex((el) => el.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= elements.length) return elements;
  const copy = elements.slice();
  [copy[from], copy[to]] = [copy[to]!, copy[from]!];
  return copy;
}
