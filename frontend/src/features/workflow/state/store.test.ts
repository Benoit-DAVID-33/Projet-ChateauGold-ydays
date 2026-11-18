import { describe, expect, it } from "vitest";

import { textValue } from "../model/values";
import { NOT_RUN_MESSAGE } from "../engine/run";
import { fakeHost, fakeServices, makeMedia } from "../test/fakes";
import { createWorkflowStore, DEFAULT_WORKFLOW_NAME, isDirty } from "./store";

function setup() {
  const store = createWorkflowStore();
  const add = (type: string, x = 0) => store.getState().addNode(type, { x, y: 0 }, null)!;
  return { store, add, state: () => store.getState() };
}

const link = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  source,
  sourceHandle,
  target,
  targetHandle,
});

describe("magasin de l'éditeur", () => {
  it("ajoute un nœud sélectionné avec ses paramètres initiaux", () => {
    const { store, add, state } = setup();
    const first = add("text");
    const second = add("text");
    expect(state().nodes.map((n) => n.id)).toEqual([first, second]);
    expect(state().nodes.map((n) => n.selected)).toEqual([false, true]);
    expect(state().nodes[1]?.position).toEqual({ x: 32, y: 32 });
    expect(state().nodes[0]?.data).toEqual({ nodeType: "text", params: { text: "" } });

    const atelier = store.getState().addNode("atelier-media", { x: 0, y: 400 }, fakeHost());
    expect(state().nodes.find((n) => n.id === atelier)?.data.params).toEqual({ kind: "video" });
    expect(store.getState().addNode("inconnu", { x: 0, y: 0 }, null)).toBeNull();
  });

  it("n'autorise que les connexions compatibles et sans boucle", () => {
    const { add, state } = setup();
    const text = add("text");
    const t2i = add("kling-text-to-image");
    const i2v = add("kling-image-to-video");

    expect(state().connect(link(text, "text", i2v, "image"))).toBe(false); // texte -> image
    expect(state().connect(link(t2i, "image", t2i, "prompt"))).toBe(false); // sur lui-même
    expect(state().connect(link(text, "text", t2i, "prompt"))).toBe(true);
    expect(state().connect(link(t2i, "image", i2v, "image"))).toBe(true);
    expect(state().edges).toHaveLength(2);

    const concat = add("concat-text");
    const assistant = add("assistant");
    expect(state().connect(link(concat, "text", assistant, "intent"))).toBe(true);
    expect(state().connect(link(assistant, "prompt", concat, "a"))).toBe(false); // boucle
  });

  it("remplace le lien existant d'une entrée", () => {
    const { add, state } = setup();
    const a = add("text");
    const b = add("text");
    const t2i = add("kling-text-to-image");
    state().connect(link(a, "text", t2i, "prompt"));
    state().connect(link(b, "text", t2i, "prompt"));
    expect(state().edges.map((e) => e.source)).toEqual([b]);
  });

  it("retire les liens devenus incompatibles quand un paramètre change de type", () => {
    const { add, state } = setup();
    const library = add("library-media");
    const i2v = add("kling-image-to-video");
    state().connect(link(library, "media", i2v, "image"));
    expect(state().edges).toHaveLength(1);

    state().updateParams(library, { mediaId: "v", mediaKind: "video", mediaName: "clip.mp4" });
    expect(state().edges).toHaveLength(0);
    expect(state().feedback?.title).toBe("Un lien devenu incompatible a été retiré.");
  });

  it("suit les modifications non enregistrées", () => {
    const { store, add, state } = setup();
    expect(isDirty(state())).toBe(false);
    const id = add("text");
    expect(isDirty(state())).toBe(true);
    state().markSaved("wf-1", "Essai");
    expect(isDirty(state())).toBe(false);
    expect(state()).toMatchObject({ workflowId: "wf-1", name: "Essai" });

    state().onNodesChange([{ type: "select", id, selected: false }]);
    expect(isDirty(state())).toBe(false);
    state().updateParams(id, { text: "nouveau" });
    expect(isDirty(state())).toBe(true);

    state().detach();
    expect(store.getState().workflowId).toBeNull();
    state().reset();
    expect(state()).toMatchObject({ nodes: [], name: DEFAULT_WORKFLOW_NAME, workflowId: null });
    expect(isDirty(state())).toBe(false);
  });

  it("supprime les liens et états d'un nœud retiré", () => {
    const { add, state } = setup();
    const text = add("text");
    const assistant = add("assistant");
    state().connect(link(text, "text", assistant, "intent"));
    state().onNodesChange([{ type: "remove", id: text }]);
    expect(state().nodes.map((n) => n.id)).toEqual([assistant]);
    expect(state().edges).toEqual([]);
  });

  it("exécute le graphe et publie les états et le bilan", async () => {
    const { add, state } = setup();
    const text = add("text");
    const assistant = add("assistant");
    state().updateParams(text, { text: "Intention" });
    state().connect(link(text, "text", assistant, "intent"));

    const promise = state().run({ host: null, api: fakeServices() });
    expect(state().running).toBe(true);
    const result = await promise;

    expect(result?.outcome).toBe("succeeded");
    expect(state().running).toBe(false);
    expect(state().runStates[assistant]?.outputs?.prompt).toEqual(textValue("Intention"));
    expect(state().feedback).toEqual({
      tone: "success",
      title: "Exécution terminée : 2 nœuds exécutés.",
    });
  });

  it("résume un graphe invalide et un arrêt", async () => {
    const { add, state } = setup();
    add("kling-text-to-image");
    await state().run({ host: null, api: fakeServices() });
    expect(state().feedback).toMatchObject({
      tone: "error",
      title: "Le workflow n'est pas valide : rien n'a été exécuté.",
      details: ["« Texte vers image » : l'entrée obligatoire « Prompt » n'est pas connectée."],
    });

    state().reset();
    const library = add("library-media");
    const output = add("output");
    state().updateParams(library, { mediaId: "m", mediaKind: "image", mediaName: "m.png" });
    state().connect(link(library, "media", output, "media"));
    const api = fakeServices();
    api.media.get.mockImplementation(async () => {
      state().stop();
      return makeMedia({ id: "m" });
    });
    await state().run({ host: null, api });
    expect(state().feedback).toEqual({ tone: "info", title: "Exécution arrêtée." });
    expect(state().runStates[output]).toMatchObject({
      status: "skipped",
      message: NOT_RUN_MESSAGE,
    });
  });
});
