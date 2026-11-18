import { beforeEach, describe, expect, it } from "vitest";

import { HISTORY_LIMIT } from "../model/constants";
import type { MediaInfo } from "../model/types";
import { shape, shape3d } from "../test-utils/fixtures";
import { useEditorStore } from "./editorStore";
import { selectCanRedo, selectCanUndo, selectSelectedElement } from "./selectors";

const IMAGE: MediaInfo = { kind: "image", name: "photo.png", width: 1000, height: 800 };
const VIDEO: MediaInfo = {
  kind: "video",
  name: "clip.mp4",
  width: 1920,
  height: 1080,
  duration: 10,
};

const store = () => useEditorStore.getState();

function setup(info: MediaInfo | null = IMAGE) {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  store().reset(info?.kind ?? null);
  if (info) store().setMediaInfo(info);
  store().setPlacementProvider(() => ({ center: { x: 500, y: 400 }, unitsPerPx: 2 }));
}

beforeEach(() => setup());

describe("création d'éléments", () => {
  it("refuse tant que le média n'est pas chargé (message d'origine)", () => {
    setup(null);
    store().reset("image");
    expect(store().addShape("square")).toBe(false);
    expect(store().elements).toHaveLength(0);
    expect(store().notice?.text).toBe("Veuillez attendre que l'image soit complètement chargée.");
  });
  it("ajoute au centre visible, sélectionne et enregistre l'historique", () => {
    expect(store().addShape("square")).toBe(true);
    const [el] = store().elements;
    expect(el).toMatchObject({ x: 400, y: 300, width: 200, height: 200, startTime: 0 });
    expect(store().selectedId).toBe(el?.id);
    expect(selectCanUndo(store())).toBe(true);
  });
  it("applique la couleur choisie à tous les types d'élément", () => {
    store().setColor("#FF00FF");
    store().addLine("curved");
    store().addShape3D("sphere");
    expect(store().elements.map((e) => e.color)).toEqual(["#FF00FF", "#FF00FF"]);
  });
  it("vidéo : startTime = temps courant", () => {
    setup(VIDEO);
    store().setCurrentTime(4.2);
    store().addShape("circle");
    expect(store().elements[0]?.startTime).toBe(4.2);
  });
  it("ajouter une forme quitte l'outil actif", () => {
    store().activateStrokeTool("pencil");
    store().addShape("diamond");
    expect(store().tool.kind).toBe("none");
  });
});

describe("texte et dessin libre", () => {
  it("mode texte : texte requis (message d'origine)", () => {
    expect(store().activateTextMode()).toBe(false);
    expect(store().notice?.text).toBe("Veuillez entrer un texte");
    store().setTextDraft("  Bonjour ");
    store().setFontSize(30);
    expect(store().activateTextMode()).toBe(true);
    expect(store().tool).toEqual({ kind: "text", text: "Bonjour", fontSize: 30 });
  });
  it("chaque clic pose une copie ; le mode reste actif", () => {
    store().setTextDraft("A");
    store().activateTextMode();
    store().placeText({ x: 10, y: 10 }, 2);
    store().placeText({ x: 50, y: 50 }, 2);
    expect(store().elements).toHaveLength(2);
    expect(store().elements[0]).toMatchObject({ type: "text", fontSize: 48 });
    expect(store().tool.kind).toBe("text");
    expect(store().selectedId).toBeNull();
  });
  it("tracé : épaisseur du curseur, points ajoutés", () => {
    store().setBrushSize(8);
    expect(store().startStroke({ x: 0, y: 0 }, 2)).toBeNull(); // aucun outil actif
    store().activateStrokeTool("marker");
    const id = store().startStroke({ x: 0, y: 0 }, 2)!;
    store().extendStroke(id, [
      { x: 5, y: 5 },
      { x: 9, y: 9 },
    ]);
    const [drawn] = store().elements;
    expect(drawn).toMatchObject({ tool: "marker", strokeWidth: 16 });
    expect(drawn?.type === "stroke" ? drawn.points : []).toHaveLength(3);
  });
  it("bornes des curseurs", () => {
    store().setBrushSize(50);
    store().setFontSize(2);
    expect(store().brushSize).toBe(20);
    expect(store().fontSize).toBe(12);
  });
});

describe("suppression (sémantique image / vidéo)", () => {
  it("image : retrait définitif", () => {
    store().addShape("square");
    store().deleteElement();
    expect(store().elements).toHaveLength(0);
    expect(store().selectedId).toBeNull();
  });
  it("vidéo : endTime = temps courant, l'élément reste visible avant", () => {
    setup(VIDEO);
    store().setCurrentTime(1);
    store().addShape("square");
    store().setCurrentTime(3);
    store().deleteElement(store().elements[0]?.id);
    expect(store().elements[0]?.endTime).toBe(3);
  });
  it("vidéo : retrait si t inférieur ou égal à startTime", () => {
    setup(VIDEO);
    store().setCurrentTime(2);
    store().addShape("square");
    store().deleteElement();
    expect(store().elements).toHaveLength(0);
  });
  it("changer de temps désélectionne un élément devenu invisible", () => {
    setup(VIDEO);
    store().setCurrentTime(2);
    store().addShape("square");
    store().setCurrentTime(1);
    expect(store().selectedId).toBeNull();
  });
});

describe("historique", () => {
  it("annuler / rétablir", () => {
    store().addShape("square");
    store().addShape("circle");
    store().undo();
    expect(store().elements).toHaveLength(1);
    store().undo();
    expect(store().elements).toHaveLength(0);
    expect(store().selectedId).toBeNull();
    store().redo();
    expect(store().elements).toHaveLength(1);
    expect(selectCanRedo(store())).toBe(true);
  });
  it("un geste (déplacement continu) = une seule entrée", () => {
    store().addShape("square");
    const id = store().elements[0]!.id;
    const before = store().history.past.length;
    store().beginGesture();
    for (let i = 1; i <= 5; i++) {
      store().updateElement(id, (el) => (el.type === "shape" ? { ...el, x: el.x + i } : el));
    }
    store().endGesture();
    expect(store().history.past).toHaveLength(before + 1);
    store().undo();
    expect(store().elements[0]).toMatchObject({ x: 400 });
  });
  it("un geste sans modification n'ajoute rien", () => {
    store().beginGesture();
    store().endGesture();
    expect(store().history.past).toHaveLength(0);
  });
  it("historique borné", () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) store().addElement(shape({ id: `s${i}` }));
    expect(store().history.past).toHaveLength(HISTORY_LIMIT);
  });
  it("une nouvelle action vide la pile « rétablir »", () => {
    store().addShape("square");
    store().undo();
    store().addShape("circle");
    expect(selectCanRedo(store())).toBe(false);
  });
});

describe("menu contextuel et réinitialisation", () => {
  it("Motion Tracking bascule le drapeau et informe l'utilisateur", () => {
    store().addElement(shape());
    store().toggleMotionTracking();
    expect(store().elements[0]?.motionTracking).toBe(true);
    expect(store().notice?.text).toContain("Motion Tracking ACTIVÉ pour cet élément");
    store().toggleMotionTracking();
    expect(store().notice?.text).toContain("DÉSACTIVÉ");
  });
  it("« Faire tourner » ne s'arme que pour un objet 3D", () => {
    store().addElement(shape());
    store().armRotation();
    expect(store().rotateArmed).toBe(false);
    store().addElement(shape3d());
    store().armRotation();
    expect(store().rotateArmed).toBe(true);
    store().deactivateTools();
    expect(store().rotateArmed).toBe(false);
  });
  it("reset vide le document mais garde les réglages d'outils", () => {
    store().setColor("#000080");
    store().addShape("square");
    store().reset("video");
    expect(store()).toMatchObject({
      elements: [],
      selectedId: null,
      mediaInfo: null,
      mediaKind: "video",
      color: "#000080",
    });
    expect(selectSelectedElement(store())).toBeNull();
    expect(selectCanUndo(store())).toBe(false);
  });
});

describe("seek, ordre et fenêtres temporelles", () => {
  it("requestSeek : borné à la durée, temps courant mis à jour, acquittement", () => {
    setup(VIDEO);
    store().requestSeek(42);
    expect(store().seekRequest).toMatchObject({ time: 10 });
    expect(store().currentTime).toBe(10);
    const id = store().seekRequest!.id;
    store().consumeSeekRequest(id + 1);
    expect(store().seekRequest).not.toBeNull();
    store().consumeSeekRequest(id);
    expect(store().seekRequest).toBeNull();
  });
  it("requestSeek ne fait rien pour une image", () => {
    store().requestSeek(3);
    expect(store().seekRequest).toBeNull();
  });
  it("focusElement : sélectionne et se place au début d'un élément invisible", () => {
    setup(VIDEO);
    store().addElement(shape({ id: "later", startTime: 6, endTime: 8 }), { select: false });
    store().focusElement("later");
    expect(store().selectedId).toBe("later");
    expect(store().seekRequest?.time).toBe(6);
    store().consumeSeekRequest(store().seekRequest!.id);
    store().focusElement("later");
    expect(store().seekRequest).toBeNull(); // déjà visible : pas de seek
  });
  it("mettre en avant / en arrière : annulable", () => {
    store().addElement(shape({ id: "a" }));
    store().addElement(shape({ id: "b" }));
    store().sendBackward("b");
    expect(store().elements.map((e) => e.id)).toEqual(["b", "a"]);
    store().bringForward("b");
    expect(store().elements.map((e) => e.id)).toEqual(["a", "b"]);
    store().undo();
    expect(store().elements.map((e) => e.id)).toEqual(["b", "a"]);
    const past = store().history.past.length;
    store().bringForward("a"); // déjà au-dessus : rien n'est enregistré
    expect(store().history.past).toHaveLength(past);
  });
  it("setElementTiming : borné à la durée et enregistré", () => {
    setup(VIDEO);
    store().addElement(shape({ id: "a" }));
    store().setElementTiming("a", { startTime: -2, endTime: 30 });
    expect(store().elements[0]).toMatchObject({ startTime: 0, endTime: null });
    store().setElementTiming("a", { startTime: 2, endTime: 4 });
    expect(store().elements[0]).toMatchObject({ startTime: 2, endTime: 4 });
    store().undo();
    expect(store().elements[0]).toMatchObject({ startTime: 0, endTime: null });
  });
});
