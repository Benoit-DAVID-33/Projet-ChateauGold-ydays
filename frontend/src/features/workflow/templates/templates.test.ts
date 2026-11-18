import { describe, expect, it } from "vitest";

import { validateGraph } from "../engine/validate";
import { flowToGraph, graphToFlow } from "../model/flow";
import { GRAPH_LIMITS, graphSize, parseWorkflowGraph } from "../model/graph";
import { NODE_REGISTRY } from "../nodes/registry";
import { fakeHost, makeMedia } from "../test/fakes";
import { instantiateTemplate, TEMPLATES } from "./templates";

describe("modèles de workflow", () => {
  it("propose les quatre modèles attendus", () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual([
      "Texte vers image puis vidéo",
      "Transformer la vidéo de l'Atelier",
      "Animer l'image annotée",
      "Traitement par l'API",
    ]);
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    "« %s » respecte le schéma et se valide",
    (_name, template) => {
      const graph = instantiateTemplate(template);
      expect(parseWorkflowGraph(JSON.parse(JSON.stringify(graph)))).toEqual({ ok: true, graph });
      expect(graphSize(graph)).toBeLessThan(GRAPH_LIMITS.maxBytes);
      for (const node of graph.nodes) expect(NODE_REGISTRY.get(node.type)).toBeDefined();
      expect(validateGraph(graph, NODE_REGISTRY)).toEqual([]);
      const flow = graphToFlow(graph);
      expect(flowToGraph(flow.nodes, flow.edges)).toEqual(graph);
    },
  );

  it("se valident entièrement une fois l'Atelier et la bibliothèque renseignés", () => {
    const videoHost = fakeHost();
    const imageHost = fakeHost({ media: makeMedia({ kind: "image" }) });
    const [textToVideo, transform, animate, processing] = TEMPLATES.map(instantiateTemplate);
    const check = (graph: typeof textToVideo, host = videoHost) =>
      validateGraph(graph!, NODE_REGISTRY, { nodeChecks: { host } });

    expect(check(textToVideo)).toEqual([]);
    expect(check(transform)).toEqual([]);
    expect(check(animate, imageHost)).toEqual([]);

    expect(check(processing).map((i) => i.message)).toEqual([
      "« Média de la bibliothèque » : aucun média sélectionné.",
    ]);
    const source = processing!.nodes.find((node) => node.type === "library-media");
    source!.data = { mediaId: "m1", mediaKind: "video", mediaName: "clip.mp4" };
    expect(check(processing)).toEqual([]);
  });

  it("fournit des copies indépendantes", () => {
    const template = TEMPLATES[0]!;
    const copy = instantiateTemplate(template);
    copy.nodes[0]!.data.text = "modifié";
    expect(template.graph.nodes[0]!.data.text).not.toBe("modifié");
  });
});
