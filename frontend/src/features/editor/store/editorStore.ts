/**
 * Store unique de l'éditeur (zustand) : source de vérité des annotations,
 * de la sélection, des outils, de la temporalité vidéo et de l'historique.
 * Remplace les globales `window.addedElements` / `window.selectedElement`.
 * L'Assistant IA lit `elements` et `mediaInfo`.
 */
import { create } from "zustand";

import { BRUSH_SIZE, FONT_SIZE } from "../model/constants";
import {
  createLine,
  createShape,
  createShape3D,
  createStroke,
  createText,
  type CreationContext,
} from "../model/factory";
import { clamp } from "../model/geometry";
import { moveInStack } from "../model/order";
import { deleteElementAt, normalizeWindow, type TimeWindow } from "../model/timing";
import {
  DEFAULT_COLOR,
  isVisibleAt,
  type AnnotationElement,
  type LineKind,
  type MediaInfo,
  type Point,
  type Shape3DKind,
  type ShapeKind,
  type StrokeTool,
} from "../model/types";
import { emptyHistory, record, redo, undo, type History } from "./history";

export type ActiveTool =
  | { kind: "none" }
  | { kind: "text"; text: string; fontSize: number }
  | { kind: "stroke"; tool: StrokeTool };

/** Où placer un nouvel élément et à quelle échelle (fourni par MediaEditor). */
export interface Placement {
  center: Point;
  /** Pixels natifs par pixel écran. */
  unitsPerPx: number;
}
export type PlacementProvider = () => Placement | null;

/** Demande de positionnement du lecteur vidéo, honorée par MediaEditor. */
export interface SeekRequest {
  id: number;
  time: number;
}

export type NoticeTone = "success" | "error" | "info";
export interface EditorNotice {
  id: number;
  tone: NoticeTone;
  text: string;
}

export interface EditorState {
  /** Type du média courant (connu avant le chargement des métadonnées). */
  mediaKind: MediaInfo["kind"] | null;
  mediaInfo: MediaInfo | null;
  /** Annotations, ordre = ordre de rendu (dernier au-dessus). */
  elements: AnnotationElement[];
  selectedId: string | null;
  /** Temps vidéo courant en secondes (0 pour une image), synchronisé avec le lecteur. */
  currentTime: number;
  tool: ActiveTool;
  /** « Faire tourner » armé : le prochain glisser sur un objet 3D le fait tourner. */
  rotateArmed: boolean;
  /** Couleur appliquée à tout nouvel élément. */
  color: string;
  /** Épaisseur des tracés libres (pixels écran, 1–20). */
  brushSize: number;
  /** Taille de police du texte à poser (pixels écran, 12–72). */
  fontSize: number;
  textDraft: string;
  history: History;
  notice: EditorNotice | null;
  /** Enregistré par MediaEditor ; non réinitialisé par `reset`. */
  placementProvider: PlacementProvider | null;
  /** État de référence du geste en cours : un geste = une entrée d'historique. */
  gestureBase: AnnotationElement[] | null;
  /** Dernière demande de seek non encore appliquée au <video> (null = aucune). */
  seekRequest: SeekRequest | null;
}

export interface EditorActions {
  reset(kind?: MediaInfo["kind"] | null): void;
  setMediaInfo(info: MediaInfo | null): void;
  setCurrentTime(time: number): void;
  setPlacementProvider(provider: PlacementProvider | null): void;

  addShape(kind: ShapeKind): boolean;
  addShape3D(kind: Shape3DKind): boolean;
  addLine(kind: LineKind): boolean;
  addElement(element: AnnotationElement, options?: { select?: boolean }): void;
  placeText(topLeft: Point, unitsPerPx: number): boolean;
  startStroke(point: Point, unitsPerPx: number): string | null;
  extendStroke(id: string, points: readonly Point[]): void;

  select(id: string | null): void;
  updateElement(id: string, update: (element: AnnotationElement) => AnnotationElement): void;
  beginGesture(): void;
  endGesture(): void;
  deleteElement(id?: string | null): void;
  /** Sélectionne un élément ; en vidéo, se place à son début s'il n'est pas visible. */
  focusElement(id: string): void;
  /** Avance / recule d'un cran dans la pile (enregistré dans l'historique). */
  bringForward(id: string): void;
  sendBackward(id: string): void;
  /** Fenêtre [startTime, endTime) bornée à la durée de la vidéo. */
  setElementTiming(id: string, window: TimeWindow): void;
  /** Demande au lecteur vidéo de se placer à `time` (bornée à la durée). */
  requestSeek(time: number): void;
  consumeSeekRequest(id: number): void;
  toggleMotionTracking(id?: string | null): void;
  undo(): void;
  redo(): void;

  setColor(color: string): void;
  setBrushSize(size: number): void;
  setFontSize(size: number): void;
  setTextDraft(text: string): void;
  activateTextMode(): boolean;
  activateStrokeTool(tool: StrokeTool): void;
  deactivateTools(): void;
  armRotation(id?: string | null): void;
  disarmRotation(): void;

  notify(tone: NoticeTone, text: string): void;
  dismissNotice(id: number): void;
}

export type EditorStore = EditorState & EditorActions;

const NONE: ActiveTool = { kind: "none" };
let noticeSeq = 0;
let seekSeq = 0;

/** Partie « document » remise à zéro à chaque changement de média. */
function documentState(kind: MediaInfo["kind"] | null) {
  return {
    mediaKind: kind,
    mediaInfo: null,
    elements: [],
    selectedId: null,
    currentTime: 0,
    tool: NONE,
    rotateArmed: false,
    history: emptyHistory(),
    notice: null,
    gestureBase: null,
    seekRequest: null,
  } satisfies Partial<EditorState>;
}

function notReadyMessage(kind: MediaInfo["kind"] | null): string {
  if (kind === "image") return "Veuillez attendre que l'image soit complètement chargée.";
  if (kind === "video") return "Veuillez attendre que la vidéo soit chargée.";
  return "Aucun média chargé.";
}

const findById = (elements: readonly AnnotationElement[], id: string | null) =>
  id === null ? undefined : elements.find((el) => el.id === id);

export const useEditorStore = create<EditorStore>()((set, get) => {
  /** Remplace les éléments ; enregistre l'historique hors geste en cours. */
  const commit = (elements: AnnotationElement[], extra: Partial<EditorState> = {}) =>
    set((s) => ({
      elements,
      history: s.gestureBase ? s.history : record(s.history, s.elements),
      ...extra,
    }));

  /** Garde la sélection seulement si l'élément existe et est visible. */
  const validSelection = (elements: AnnotationElement[], id: string | null, time: number) => {
    const el = findById(elements, id);
    return el && isVisibleAt(el, time) ? el.id : null;
  };

  const creationContext = (unitsPerPx?: number): CreationContext | null => {
    const s = get();
    const info = s.mediaInfo;
    if (!info) {
      s.notify("error", notReadyMessage(s.mediaKind));
      return null;
    }
    const placement = s.placementProvider?.() ?? null;
    return {
      center: placement?.center ?? { x: info.width / 2, y: info.height / 2 },
      unitsPerPx: unitsPerPx ?? placement?.unitsPerPx ?? 1,
      color: s.color,
      time: info.kind === "video" ? s.currentTime : 0,
    };
  };

  const addCreated = (make: (ctx: CreationContext) => AnnotationElement): boolean => {
    const ctx = creationContext();
    if (!ctx) return false;
    set({ tool: NONE, rotateArmed: false });
    get().addElement(make(ctx));
    return true;
  };

  return {
    ...documentState(null),
    color: DEFAULT_COLOR,
    brushSize: BRUSH_SIZE.default,
    fontSize: FONT_SIZE.default,
    textDraft: "",
    placementProvider: null,

    reset: (kind = null) => set(documentState(kind)),
    setMediaInfo: (info) => set((s) => ({ mediaInfo: info, mediaKind: info?.kind ?? s.mediaKind })),
    setCurrentTime: (time) => {
      const s = get();
      if (s.currentTime === time) return;
      set({ currentTime: time, selectedId: validSelection(s.elements, s.selectedId, time) });
    },
    setPlacementProvider: (provider) => set({ placementProvider: provider }),

    addShape: (kind) => addCreated((ctx) => createShape(kind, ctx)),
    addShape3D: (kind) => addCreated((ctx) => createShape3D(kind, ctx)),
    addLine: (kind) => addCreated((ctx) => createLine(kind, ctx)),
    addElement: (element, { select = true } = {}) =>
      commit([...get().elements, element], select ? { selectedId: element.id } : {}),

    placeText: (topLeft, unitsPerPx) => {
      const { tool } = get();
      if (tool.kind !== "text") return false;
      const ctx = creationContext(unitsPerPx);
      if (!ctx) return false;
      // Le mode texte reste actif : chaque clic pose une copie (comportement d'origine).
      get().addElement(createText(tool.text, topLeft, tool.fontSize, ctx), { select: false });
      return true;
    },
    startStroke: (point, unitsPerPx) => {
      const { tool, brushSize } = get();
      if (tool.kind !== "stroke") return null;
      const ctx = creationContext(unitsPerPx);
      if (!ctx) return null;
      const stroke = createStroke(tool.tool, point, brushSize, ctx);
      get().addElement(stroke, { select: false });
      return stroke.id;
    },
    extendStroke: (id, points) =>
      get().updateElement(id, (el) =>
        el.type === "stroke" && points.length > 0
          ? { ...el, points: [...el.points, ...points] }
          : el,
      ),

    select: (id) => {
      if (get().selectedId !== id) set({ selectedId: id });
    },
    updateElement: (id, update) => {
      const { elements } = get();
      const index = elements.findIndex((el) => el.id === id);
      const current = elements[index];
      if (!current) return;
      const next = update(current);
      if (next === current) return;
      const copy = elements.slice();
      copy[index] = next;
      commit(copy);
    },
    beginGesture: () => set({ gestureBase: get().elements }),
    endGesture: () => {
      const s = get();
      if (!s.gestureBase) return;
      const changed = s.gestureBase !== s.elements;
      set({
        gestureBase: null,
        history: changed ? record(s.history, s.gestureBase) : s.history,
      });
    },
    deleteElement: (id) => {
      const s = get();
      const target = id ?? s.selectedId;
      if (!target || !findById(s.elements, target)) return;
      const kind = s.mediaInfo?.kind ?? s.mediaKind ?? "image";
      commit(deleteElementAt(s.elements, target, kind, s.currentTime), {
        selectedId: null,
        rotateArmed: false,
      });
    },
    focusElement: (id) => {
      const s = get();
      const el = findById(s.elements, id);
      if (!el) return;
      if (s.mediaInfo?.kind === "video" && !isVisibleAt(el, s.currentTime)) {
        s.requestSeek(el.startTime);
      }
      set({ selectedId: id });
    },
    bringForward: (id) => {
      const { elements } = get();
      const next = moveInStack(elements, id, 1);
      if (next !== elements) commit(next);
    },
    sendBackward: (id) => {
      const { elements } = get();
      const next = moveInStack(elements, id, -1);
      if (next !== elements) commit(next);
    },
    setElementTiming: (id, window) => {
      const duration = get().mediaInfo?.duration;
      const timing =
        duration !== undefined && Number.isFinite(duration)
          ? normalizeWindow(window, duration)
          : window;
      get().updateElement(id, (el) =>
        el.startTime === timing.startTime && el.endTime === timing.endTime
          ? el
          : { ...el, startTime: timing.startTime, endTime: timing.endTime },
      );
    },
    requestSeek: (time) => {
      const info = get().mediaInfo;
      if (info?.kind !== "video" || !Number.isFinite(time)) return;
      const target = clamp(time, 0, info.duration ?? Infinity);
      set({ seekRequest: { id: ++seekSeq, time: target } });
      // Mise à jour immédiate : curseur et visibilité suivent sans attendre « seeked ».
      get().setCurrentTime(target);
    },
    consumeSeekRequest: (id) => {
      if (get().seekRequest?.id === id) set({ seekRequest: null });
    },
    toggleMotionTracking: (id) => {
      const s = get();
      const target = id ?? s.selectedId;
      const el = findById(s.elements, target);
      if (!el) {
        s.notify("error", "Aucun élément sélectionné");
        return;
      }
      const enabled = !el.motionTracking;
      s.updateElement(el.id, (current) => ({ ...current, motionTracking: enabled }));
      s.notify(
        "info",
        `Motion Tracking ${enabled ? "ACTIVÉ" : "DÉSACTIVÉ"} pour cet élément. ` +
          "L'objet restera fixe à sa position et suivra les mouvements de la vidéo.",
      );
    },
    undo: () => {
      const s = get();
      const result = undo(s.history, s.elements);
      if (!result) return;
      set({
        elements: result.elements,
        history: result.history,
        gestureBase: null,
        selectedId: validSelection(result.elements, s.selectedId, s.currentTime),
      });
    },
    redo: () => {
      const s = get();
      const result = redo(s.history, s.elements);
      if (!result) return;
      set({
        elements: result.elements,
        history: result.history,
        gestureBase: null,
        selectedId: validSelection(result.elements, s.selectedId, s.currentTime),
      });
    },

    setColor: (color) => set({ color }),
    setBrushSize: (size) =>
      set({ brushSize: clamp(Math.round(size), BRUSH_SIZE.min, BRUSH_SIZE.max) }),
    setFontSize: (size) => set({ fontSize: clamp(Math.round(size), FONT_SIZE.min, FONT_SIZE.max) }),
    setTextDraft: (text) => set({ textDraft: text }),
    activateTextMode: () => {
      const s = get();
      const text = s.textDraft.trim();
      if (!text) {
        s.notify("error", "Veuillez entrer un texte");
        return false;
      }
      set({
        tool: { kind: "text", text, fontSize: s.fontSize },
        selectedId: null,
        rotateArmed: false,
      });
      return true;
    },
    activateStrokeTool: (tool) =>
      set({ tool: { kind: "stroke", tool }, selectedId: null, rotateArmed: false }),
    deactivateTools: () => set({ tool: NONE, rotateArmed: false }),
    armRotation: (id) => {
      const s = get();
      const el = findById(s.elements, id ?? s.selectedId);
      if (el?.type !== "shape3d") return;
      set({ rotateArmed: true, tool: NONE, selectedId: el.id });
      s.notify("info", "Glissez sur l'objet 3D pour le faire tourner.");
    },
    disarmRotation: () => {
      if (get().rotateArmed) set({ rotateArmed: false });
    },

    notify: (tone, text) => set({ notice: { id: ++noticeSeq, tone, text } }),
    dismissNotice: (id) => {
      if (get().notice?.id === id) set({ notice: null });
    },
  };
});
