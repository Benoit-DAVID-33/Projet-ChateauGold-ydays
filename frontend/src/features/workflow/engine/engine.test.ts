import { describe, expect, it } from "vitest";

import { textValue, type WorkflowValue } from "../model/values";
import { blockingClock, fakeClock, fakeHost, fakeServices, makeMedia } from "../test/fakes";
import { CANCELLED_MESSAGE, NOT_RUN_MESSAGE, runWorkflow } from "./run";
import { ancestorsOf, findCycle, topologicalOrder, wouldCreateCycle } from "./topology";
import type {
  EngineEdge,
  EngineGraph,
  EngineNode,
  EngineNodeDefinition,
  NodeRunState,
} from "./types";
import { validateGraph } from "./validate";

// --- Registre de test -------------------------------------------------------
const text = (value: WorkflowValue | undefined) => (value?.kind === "text" ? value.text : "");

const DEFINITIONS: EngineNodeDefinition[] = [
  {
    type: "source",
    title: "Source",
    inputs: [],
    outputs: [{ id: "out", type: "text", label: "Texte" }],
    defaultData: { text: "" },
    execute: async (_ctx, _inputs, data) => ({ outputs: { out: textValue(String(data.text)) } }),
  },
  {
    type: "upper",
    title: "Majuscules",
    inputs: [{ id: "in", type: "text", label: "Entrée" }],
    outputs: [{ id: "out", type: "text", label: "Sortie" }],
    defaultData: {},
    execute: async (ctx, inputs) => {
      ctx.reportProgress({ message: "conversion", value: 0.5 });
      return { outputs: { out: textValue(text(inputs.in).toUpperCase()) }, message: "ok" };
    },
  },
  {
    type: "join",
    title: "Jointure",
    inputs: [
      { id: "a", type: "text", label: "A" },
      { id: "b", type: "text", label: "B", optional: true },
    ],
    outputs: [{ id: "out", type: "text", label: "Sortie" }],
    defaultData: {},
    execute: async (_ctx, inputs) => ({
      outputs: { out: textValue([text(inputs.a), text(inputs.b)].filter(Boolean).join("+")) },
    }),
  },
  {
    type: "fail",
    title: "Échec",
    inputs: [{ id: "in", type: "text", label: "Entrée", optional: true }],
    outputs: [{ id: "out", type: "text", label: "Sortie" }],
    defaultData: {},
    execute: async () => {
      throw new Error("boum");
    },
  },
  {
    type: "image",
    title: "Image",
    inputs: [],
    outputs: [{ id: "image", type: "image", label: "Image" }],
    defaultData: {},
    execute: async () => ({ outputs: { image: { kind: "media", media: makeMedia() } } }),
  },
  {
    type: "slow",
    title: "Lent",
    inputs: [{ id: "in", type: "text", label: "Entrée", optional: true }],
    outputs: [{ id: "out", type: "text", label: "Sortie" }],
    defaultData: {},
    execute: async (ctx) => {
      await ctx.clock.sleep(1000, ctx.signal);
      return { outputs: { out: textValue("lent") } };
    },
  },
  {
    type: "liar",
    title: "Menteur",
    inputs: [],
    outputs: [{ id: "image", type: "image", label: "Image" }],
    defaultData: {},
    execute: async () => ({ outputs: { image: textValue("pas une image") } }),
  },
  {
    type: "configurable",
    title: "Configurable",
    inputs: [],
    outputs: [{ id: "out", type: "text", label: "Sortie" }],
    defaultData: { ready: false },
    validate: (data, { host }) => [
      ...(data.ready ? [] : ["pas prêt."]),
      ...(host ? [] : ["hôte requis."]),
    ],
    execute: async () => ({ outputs: { out: textValue("x") } }),
  },
];

const registry = {
  get: (type: string) => DEFINITIONS.find((definition) => definition.type === type),
};

const n = (id: string, type: string, data: Record<string, unknown> = {}): EngineNode => ({
  id,
  type,
  data,
});
const e = (
  source: string,
  target: string,
  sourceHandle = "out",
  targetHandle = "in",
): EngineEdge => ({
  id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

function run(graph: EngineGraph, options: Partial<Parameters<typeof runWorkflow>[1]> = {}) {
  const events: [string, NodeRunState][] = [];
  const promise = runWorkflow(graph, {
    registry,
    api: fakeServices(),
    clock: fakeClock(),
    onStateChange: (id, state) => events.push([id, state]),
    ...options,
  });
  return { promise, events };
}

// --- Topologie --------------------------------------------------------------
describe("topologicalOrder", () => {
  it("respecte les dépendances et départage par l'ordre des nœuds", () => {
    const { order, blocked } = topologicalOrder(
      ["c", "b", "a", "d"],
      [
        { source: "a", target: "b" },
        { source: "b", target: "d" },
        { source: "c", target: "d" },
      ],
    );
    expect(order).toEqual(["c", "a", "b", "d"]);
    expect(blocked).toEqual([]);
  });

  it("est déterministe pour des branches indépendantes", () => {
    const ids = ["x", "y", "z"];
    expect(topologicalOrder(ids, []).order).toEqual(["x", "y", "z"]);
    expect(topologicalOrder([...ids].reverse(), []).order).toEqual(["z", "y", "x"]);
  });

  it("isole les nœuds pris dans un cycle", () => {
    const { order, blocked } = topologicalOrder(
      ["a", "b", "c"],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "b" },
      ],
    );
    expect(order).toEqual(["a"]);
    expect(blocked).toEqual(["b", "c"]);
  });
});

describe("findCycle / ancestorsOf / wouldCreateCycle", () => {
  const links = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
  ];

  it("détecte un cycle et en renvoie le chemin", () => {
    expect(findCycle(["a", "b", "c"], links)).toBeNull();
    expect(findCycle(["a", "b", "c"], [...links, { source: "c", target: "a" }])).toEqual([
      "a",
      "b",
      "c",
      "a",
    ]);
    expect(findCycle(["a"], [{ source: "a", target: "a" }])).toEqual(["a", "a"]);
  });

  it("calcule les ancêtres et prévoit les boucles", () => {
    expect([...ancestorsOf("c", links)].sort()).toEqual(["a", "b"]);
    expect(ancestorsOf("a", links).size).toBe(0);
    expect(wouldCreateCycle(links, "c", "a")).toBe(true);
    expect(wouldCreateCycle(links, "a", "c")).toBe(false);
    expect(wouldCreateCycle(links, "a", "a")).toBe(true);
  });
});

// --- Validation -------------------------------------------------------------
describe("validateGraph", () => {
  const codes = (graph: EngineGraph, options = {}) =>
    validateGraph(graph, registry, options).map((issue) => issue.code);

  it("accepte un graphe correct", () => {
    expect(codes({ nodes: [n("s", "source"), n("u", "upper")], edges: [e("s", "u")] })).toEqual([]);
  });

  it("signale un graphe vide", () => {
    const issues = validateGraph({ nodes: [], edges: [] }, registry);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/vide/);
  });

  it("signale les types inconnus", () => {
    const issues = validateGraph({ nodes: [n("x", "mystere")], edges: [] }, registry);
    expect(issues[0]).toMatchObject({ code: "unknown-type", nodeId: "x" });
    expect(issues[0]?.message).toContain("« mystere »");
  });

  it("signale les incompatibilités de types avec un message clair", () => {
    const issues = validateGraph(
      { nodes: [n("i", "image"), n("u", "upper")], edges: [e("i", "u", "image")] },
      registry,
    );
    expect(issues.map((i) => i.code)).toEqual(["type-mismatch"]);
    expect(issues[0]?.message).toBe(
      "Types incompatibles : la sortie « Image » (Image) de « Image » ne peut pas alimenter " +
        "l'entrée « Entrée » (Texte) de « Majuscules ».",
    );
  });

  it("signale les entrées manquantes mais pas les entrées facultatives", () => {
    const issues = validateGraph({ nodes: [n("j", "join")], edges: [] }, registry);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "missing-input", nodeId: "j" });
    expect(issues[0]?.message).toBe(
      "« Jointure » : l'entrée obligatoire « A » n'est pas connectée.",
    );
  });

  it("signale les ports inconnus, les entrées multiples et les liens orphelins", () => {
    const graph: EngineGraph = {
      nodes: [n("s", "source"), n("t", "source"), n("u", "upper")],
      edges: [e("s", "u"), e("t", "u"), e("s", "u", "nope", "in"), e("ghost", "u")],
    };
    expect(codes(graph)).toEqual(["duplicate-input", "unknown-port", "dangling-edge"]);
  });

  it("détecte les cycles", () => {
    const issues = validateGraph(
      {
        nodes: [n("a", "upper"), n("b", "upper")],
        edges: [e("a", "b"), e("b", "a")],
      },
      registry,
    );
    expect(issues.map((i) => i.code)).toEqual(["cycle"]);
    expect(issues[0]?.message).toBe(
      "Le workflow contient une boucle (« Majuscules » puis « Majuscules » puis « Majuscules ») : supprimez un lien pour la casser.",
    );
  });

  it("exécute les vérifications propres aux nœuds sur demande", () => {
    const graph = { nodes: [n("c", "configurable")], edges: [] };
    expect(codes(graph)).toEqual([]);
    const issues = validateGraph(graph, registry, { nodeChecks: { host: null } });
    expect(issues.map((i) => i.message)).toEqual([
      "« Configurable » : pas prêt.",
      "« Configurable » : hôte requis.",
    ]);
    expect(
      validateGraph({ nodes: [n("c", "configurable", { ready: true })], edges: [] }, registry, {
        nodeChecks: { host: fakeHost() },
      }),
    ).toEqual([]);
  });

  it("limite la vérification à la portée demandée", () => {
    const graph = { nodes: [n("s", "source"), n("j", "join")], edges: [] };
    expect(codes(graph, { scope: new Set(["s"]) })).toEqual([]);
    expect(codes(graph)).toEqual(["missing-input"]);
  });
});

// --- Exécution --------------------------------------------------------------
describe("runWorkflow", () => {
  it("exécute dans l'ordre et transmet les valeurs", async () => {
    const graph = {
      nodes: [n("j", "join"), n("u", "upper"), n("s", "source", { text: "abc" })],
      edges: [e("s", "u"), e("u", "j", "out", "a")],
    };
    const { promise, events } = run(graph);
    const result = await promise;

    expect(result.outcome).toBe("succeeded");
    expect(result.executed).toEqual(["s", "u", "j"]);
    expect(result.states.j?.outputs?.out).toEqual(textValue("ABC"));
    expect(result.states.u).toMatchObject({ status: "done", message: "ok" });
    const statuses = events.filter(([id]) => id === "u").map(([, state]) => state.status);
    expect(statuses).toEqual(["queued", "running", "running", "done"]);
    expect(events.find(([id, s]) => id === "u" && s.progress === 0.5)?.[1].message).toBe(
      "conversion",
    );
  });

  it("complète les paramètres avec les valeurs par défaut", async () => {
    const { promise } = run({ nodes: [n("s", "source")], edges: [] });
    expect((await promise).states.s?.outputs?.out).toEqual(textValue(""));
  });

  it("ignore l'aval d'un nœud en erreur et poursuit les branches indépendantes", async () => {
    const graph = {
      nodes: [n("f", "fail"), n("u", "upper"), n("j", "join"), n("s", "source", { text: "ok" })],
      edges: [e("f", "u"), e("u", "j", "out", "a"), e("s", "j", "out", "b")],
    };
    const indep = {
      nodes: [...graph.nodes, n("s2", "source", { text: "x" }), n("u2", "upper")],
      edges: [...graph.edges, e("s2", "u2")],
    };
    const result = await run(indep).promise;

    expect(result.outcome).toBe("failed");
    expect(result.states.f).toMatchObject({ status: "error", message: "boum" });
    expect(result.states.u).toMatchObject({
      status: "skipped",
      message: "Ignoré : « Échec » n'a pas abouti.",
    });
    expect(result.states.j).toMatchObject({
      status: "skipped",
      message: "Ignoré : « Majuscules » n'a pas abouti.",
    });
    expect(result.states.s?.status).toBe("done");
    expect(result.states.u2?.outputs?.out).toEqual(textValue("X"));
  });

  it("refuse d'exécuter un graphe invalide et marque les nœuds fautifs", async () => {
    const graph = { nodes: [n("s", "source"), n("j", "join")], edges: [] };
    const result = await run(graph).promise;
    expect(result.outcome).toBe("invalid");
    expect(result.executed).toEqual([]);
    expect(result.issues.map((i) => i.code)).toEqual(["missing-input"]);
    expect(result.states.j?.status).toBe("error");
    expect(result.states.s?.status).toBe("idle");
  });

  it("vérifie le type des valeurs produites", async () => {
    const result = await run({ nodes: [n("l", "liar")], edges: [] }).promise;
    expect(result.states.l).toMatchObject({
      status: "error",
      message: "La sortie « Image » a reçu un texte, type inattendu.",
    });
  });

  it("s'arrête proprement à l'annulation", async () => {
    const controller = new AbortController();
    const graph = {
      nodes: [n("s", "source"), n("w", "slow"), n("u", "upper")],
      edges: [e("s", "w"), e("w", "u")],
    };
    const result = await runWorkflow(graph, {
      registry,
      api: fakeServices(),
      clock: blockingClock(),
      signal: controller.signal,
      onStateChange: (id, state) => {
        if (id === "w" && state.status === "running") controller.abort();
      },
    });
    expect(result.outcome).toBe("cancelled");
    expect(result.states.s?.status).toBe("done");
    expect(result.states.w).toMatchObject({ status: "skipped", message: CANCELLED_MESSAGE });
    expect(result.states.u).toMatchObject({ status: "skipped", message: NOT_RUN_MESSAGE });
  });

  it("n'exécute que le nœud ciblé et ses ancêtres (« Exécuter jusqu'ici »)", async () => {
    const graph = {
      nodes: [
        n("s", "source", { text: "a" }),
        n("u", "upper"),
        n("j", "join"),
        n("other", "source"),
        n("broken", "join"),
      ],
      edges: [e("s", "u"), e("u", "j", "out", "a")],
    };
    const result = await run(graph, { targetNodeId: "u" }).promise;
    expect(result.outcome).toBe("succeeded");
    expect(result.executed).toEqual(["s", "u"]);
    expect(Object.keys(result.states).sort()).toEqual(["s", "u"]);
  });

  it("signale une cible inexistante", async () => {
    const result = await run({ nodes: [n("s", "source")], edges: [] }, { targetNodeId: "zz" })
      .promise;
    expect(result.outcome).toBe("invalid");
    expect(result.issues[0]?.code).toBe("unknown-target");
  });

  it("transmet l'hôte et l'API aux exécuteurs", async () => {
    const host = fakeHost();
    const api = fakeServices();
    const seen: unknown[] = [];
    const spy: EngineNodeDefinition = {
      type: "spy",
      title: "Espion",
      inputs: [],
      outputs: [],
      defaultData: {},
      execute: async (ctx, _inputs, _data, signal) => {
        seen.push(ctx.host, ctx.api, signal === ctx.signal);
        return {};
      },
    };
    await runWorkflow(
      { nodes: [n("x", "spy")], edges: [] },
      { registry: { get: () => spy }, api, host },
    );
    expect(seen).toEqual([host, api, true]);
  });
});
