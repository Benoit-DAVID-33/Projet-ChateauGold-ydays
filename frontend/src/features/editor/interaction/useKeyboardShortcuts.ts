/**
 * Raccourcis clavier (nouveauté : l'original n'en avait aucun).
 * Actifs quand le focus est dans l'éditeur ou sur la page (body), jamais dans
 * un champ de saisie : Suppr/Retour arrière supprime, Échap annule l'outil puis
 * désélectionne, Ctrl/Cmd+Z annule, Ctrl/Cmd+Maj+Z ou Ctrl+Y rétablit, flèches
 * déplacent (Maj : ×10), Menu contextuel ou Maj+F10 ouvre le menu de l'élément.
 */
import { useEffect, type RefObject } from "react";

import { elementBounds } from "../model/bounds";
import { rectCenter } from "../model/geometry";
import type { TextMeasurer } from "../model/text";
import { translateElement } from "../model/transform";
import type { Point } from "../model/types";
import { useEditorStore } from "../store/editorStore";
import { selectSelectedElement } from "../store/selectors";
import { nativeToClient, unitsPerPx, type ViewMetrics } from "./coords";

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

export interface KeyboardOptions {
  rootRef: RefObject<HTMLElement | null>;
  getMetrics: () => ViewMetrics | null;
  measure: TextMeasurer;
  onOpenContextMenu: (position: Point) => void;
}

export function useKeyboardShortcuts({
  rootRef,
  getMetrics,
  measure,
  onOpenContextMenu,
}: KeyboardOptions): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const root = rootRef.current;
      const target = e.target;
      if (!root || isEditableTarget(target)) return;
      const onPage = target === document.body || target === document.documentElement;
      if (!onPage && !(target instanceof Node && root.contains(target))) return;

      const store = useEditorStore.getState();
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === "z" || key === "y")) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const selected = selectSelectedElement(store);
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selected) return;
        e.preventDefault();
        store.deleteElement(selected.id);
      } else if (e.key === "Escape") {
        if (store.tool.kind !== "none" || store.rotateArmed) store.deactivateTools();
        else if (selected) store.select(null);
        else return;
        e.preventDefault();
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        const metrics = getMetrics();
        if (!selected || !metrics) return;
        e.preventDefault();
        onOpenContextMenu(nativeToClient(metrics, rectCenter(elementBounds(selected, measure))));
      } else if (ARROWS[e.key]) {
        // Les flèches restent au lecteur vidéo quand il a le focus (avance / volume).
        const metrics = getMetrics();
        if (!selected || !metrics || target instanceof HTMLMediaElement) return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * unitsPerPx(metrics);
        const { x, y } = ARROWS[e.key]!;
        store.updateElement(selected.id, (el) => translateElement(el, x * step, y * step));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rootRef, getMetrics, measure, onOpenContextMenu]);
}
