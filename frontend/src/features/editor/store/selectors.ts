/** Sélecteurs du store (à utiliser avec `useEditorStore(selector)`). */
import type { AnnotationElement } from "../model/types";
import type { EditorState } from "./editorStore";

export const selectSelectedElement = (s: EditorState): AnnotationElement | null =>
  s.selectedId === null ? null : (s.elements.find((el) => el.id === s.selectedId) ?? null);

/** Un outil capte les clics sur le média (texte, dessin libre, rotation armée). */
export const selectIsToolActive = (s: EditorState): boolean =>
  s.tool.kind !== "none" || s.rotateArmed;

export const selectCanUndo = (s: EditorState): boolean => s.history.past.length > 0;
export const selectCanRedo = (s: EditorState): boolean => s.history.future.length > 0;
