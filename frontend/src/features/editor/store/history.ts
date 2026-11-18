/**
 * Historique annuler / rétablir borné (nouveauté : l'original n'en avait pas).
 * Les éléments sont immuables : un état = une référence de tableau.
 */
import { HISTORY_LIMIT } from "../model/constants";
import type { AnnotationElement } from "../model/types";

export type Snapshot = AnnotationElement[];

export interface History {
  past: Snapshot[];
  future: Snapshot[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Enregistre `previous` comme état annulable ; vide la pile « rétablir ». */
export function record(history: History, previous: Snapshot, limit = HISTORY_LIMIT): History {
  return { past: [...history.past, previous].slice(-limit), future: [] };
}

export function undo(
  history: History,
  current: Snapshot,
): { history: History; elements: Snapshot } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    elements: previous,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
  };
}

export function redo(
  history: History,
  current: Snapshot,
): { history: History; elements: Snapshot } | null {
  const [next, ...rest] = history.future;
  if (!next) return null;
  return { elements: next, history: { past: [...history.past, current], future: rest } };
}
