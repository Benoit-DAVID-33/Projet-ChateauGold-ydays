import { describe, expect, it } from "vitest";

import { flowToGraph, graphToFlow } from "./flow";
import {
  GRAPH_LIMITS,
  graphSize,
  nameFromFileName,
  normalizeWorkflowName,
  parseWorkflowGraph,
  workflowFileName,
  workflowNameError,
  type WorkflowGraph,
} from "./graph";
import { canConnect } from "./ports";

const GRAPH: WorkflowGraph = {
  version: 1,
  nodes: [
    { id: "a", type: "text", position: { x: 0, y: 10 }, data: { text: "Été" } },
    { id: "b", type: "output", position: { x: 300, y: 10 }, data: {} },
  ],
  edges: [{ id: "e1", source: "a", sourceHandle: "text", target: "b", targetHandle: "media" }],
};

const errorOf = (raw: unknown) => {
  const result = parseWorkflowGraph(raw);
  return result.ok ? null : result.error;
};

describe("parseWorkflowGraph", () => {
  it("accepte un graphe conforme et le copie", () => {
    const result = parseWorkflowGraph(GRAPH);
    expect(result).toEqual({ ok: true, graph: GRAPH });
    if (result.ok) expect(result.graph.nodes[0]).not.toBe(GRAPH.nodes[0]);
  });

  it("complète les paramètres absents", () => {
    const raw = {
      ...GRAPH,
      nodes: [{ id: "a", type: "text", position: { x: 1, y: 2 } }],
      edges: [],
    };
    const result = parseWorkflowGraph(raw);
    expect(result.ok && result.graph.nodes[0]?.data).toEqual({});
  });

  it("applique les règles du backend avec des messages en français", () => {
    expect(errorOf(null)).toBe("Le graphe doit être un objet JSON.");
    expect(errorOf({ ...GRAPH, version: 2 })).toBe(
      "Version de graphe non supportée (attendue : 1).",
    );
    expect(errorOf({ version: 1, nodes: [] })).toMatch(/« nodes » et « edges »/);
    expect(errorOf({ ...GRAPH, nodes: [{ type: "text", position: { x: 0, y: 0 } }] })).toBe(
      "Nœud 1 : identifiant manquant.",
    );
    expect(errorOf({ ...GRAPH, nodes: [{ id: "a", position: { x: 0, y: 0 } }], edges: [] })).toBe(
      "Nœud 1 : type manquant.",
    );
    expect(errorOf({ ...GRAPH, nodes: [GRAPH.nodes[0], GRAPH.nodes[0]] })).toMatch(/en double/);
    expect(
      errorOf({ ...GRAPH, nodes: [{ id: "a", type: "t", position: { x: "1", y: 0 } }], edges: [] }),
    ).toBe("Nœud 1 : position invalide.");
    expect(errorOf({ ...GRAPH, edges: [{ ...GRAPH.edges[0], target: "zz" }] })).toBe(
      "Lien 1 : référence un nœud inexistant.",
    );
    expect(errorOf({ ...GRAPH, edges: [{ ...GRAPH.edges[0], sourceHandle: null }] })).toMatch(
      /ports/,
    );
  });

  it("refuse les graphes trop grands ou trop lourds", () => {
    const many = Array.from({ length: GRAPH_LIMITS.maxNodes + 1 }, (_, i) => ({
      id: `n${i}`,
      type: "text",
      position: { x: 0, y: 0 },
      data: {},
    }));
    expect(errorOf({ version: 1, nodes: many, edges: [] })).toMatch(/trop grand/);
    const heavy = {
      version: 1,
      nodes: [
        { id: "a", type: "text", position: { x: 0, y: 0 }, data: { text: "x".repeat(530_000) } },
      ],
      edges: [],
    };
    expect(errorOf(heavy)).toBe("Graphe trop volumineux (512 Ko maximum).");
  });
});

describe("graphSize", () => {
  it("compte comme json.dumps (ensure_ascii) côté backend", () => {
    expect(graphSize({ a: "e" })).toBe(9);
    expect(graphSize({ a: "é" })).toBe(14);
  });
});

describe("conversion React Flow", () => {
  it("fait l'aller-retour sans perte (positions arrondies)", () => {
    const flow = graphToFlow(GRAPH);
    expect(flow.nodes[0]).toMatchObject({ type: "workflow", data: { nodeType: "text" } });
    expect(flowToGraph(flow.nodes, flow.edges)).toEqual(GRAPH);
    const moved = flow.nodes.map((node) => ({ ...node, position: { x: 10.4, y: 20.6 } }));
    expect(flowToGraph(moved, flow.edges).nodes[0]?.position).toEqual({ x: 10, y: 21 });
  });

  it("survit à la sérialisation JSON", () => {
    const flow = graphToFlow(GRAPH);
    const json = JSON.parse(JSON.stringify(flowToGraph(flow.nodes, flow.edges))) as unknown;
    expect(parseWorkflowGraph(json)).toEqual({ ok: true, graph: GRAPH });
  });
});

describe("noms de workflow", () => {
  it("normalise et valide le nom comme le backend", () => {
    expect(normalizeWorkflowName("  Mon   flux \n vidéo ")).toBe("Mon flux vidéo");
    expect(workflowNameError("   ")).toBe("Le nom du workflow est requis.");
    expect(workflowNameError("a".repeat(121))).toMatch(/120 caractères/);
    expect(workflowNameError("Correct")).toBeNull();
  });

  it("dérive les noms de fichiers", () => {
    expect(workflowFileName("Vidéo d'été : test")).toBe("video-d-ete-test.json");
    expect(workflowFileName("   ")).toBe("workflow.json");
    expect(nameFromFileName("mon_flux-video.json")).toBe("mon flux video");
    expect(nameFromFileName(".json")).toBe("Workflow importé");
  });
});

describe("compatibilité des ports", () => {
  it("accepte les types identiques et image ou vidéo vers média", () => {
    expect(canConnect("text", "text")).toBe(true);
    expect(canConnect("image", "media")).toBe(true);
    expect(canConnect("video", "media")).toBe(true);
    expect(canConnect("media", "image")).toBe(false);
    expect(canConnect("image", "video")).toBe(false);
    expect(canConnect("text", "media")).toBe(false);
  });
});
