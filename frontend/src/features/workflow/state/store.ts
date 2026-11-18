/**
 * État de l'éditeur de workflow (zustand). Le magasin est unique au niveau du
 * module : le graphe en cours et une exécution lancée survivent au changement
 * d'onglet (démontage de l'éditeur).
 */
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { runWorkflow, type RunResult } from "../engine/run";
import type { NodeRunState } from "../engine/types";
import { nodeLabel } from "../engine/validate";
import type { WorkflowHost } from "../host";
import {
  flowToGraph,
  graphToFlow,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from "../model/flow";
import { emptyGraph, type NodeData, type WorkflowGraph } from "../model/graph";
import { NODE_REGISTRY, type NodeRegistry } from "../nodes/registry";
import type { Clock, WorkflowServices } from "../services";
import {
  connectEdges,
  createFlowNode,
  createNodeId,
  freePosition,
  isConnectionValid,
  pruneEdges,
} from "./graphOps";

export const DEFAULT_WORKFLOW_NAME = "Nouveau workflow";

export interface EditorFeedback {
  tone: "success" | "error" | "info" | "loading";
  title: string;
  details?: string[];
}

export interface RunRequest {
  host: WorkflowHost | null;
  api: WorkflowServices;
  targetNodeId?: string;
  clock?: Clock;
}

export interface WorkflowEditorState {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  workflowId: string | null;
  name: string;
  /** Empreinte du graphe au dernier enregistrement / chargement. */
  baseline: string;
  runStates: Record<string, NodeRunState>;
  running: boolean;
  controller: AbortController | null;
  feedback: EditorFeedback | null;

  onNodesChange(changes: NodeChange<WorkflowFlowNode>[]): void;
  onEdgesChange(changes: EdgeChange<WorkflowFlowEdge>[]): void;
  isValidConnection(connection: Connection | Edge): boolean;
  connect(connection: Connection): boolean;
  addNode(type: string, position: XYPosition, host: WorkflowHost | null): string | null;
  updateParams(nodeId: string, patch: NodeData): void;
  load(graph: WorkflowGraph, meta: { id: string | null; name: string }): void;
  reset(): void;
  /** Enregistré sous `id` ; `signature` = empreinte du graphe effectivement envoyé. */
  markSaved(id: string, name: string, signature?: string): void;
  /** Le workflow ouvert a été supprimé du serveur : il redevient non enregistré. */
  detach(): void;
  setFeedback(feedback: EditorFeedback | null): void;
  run(request: RunRequest): Promise<RunResult | null>;
  stop(): void;
}

export function graphSignature(nodes: readonly WorkflowFlowNode[], edges: readonly Edge[]): string {
  return JSON.stringify(flowToGraph(nodes, edges));
}

export function isDirty(state: Pick<WorkflowEditorState, "nodes" | "edges" | "baseline">): boolean {
  return graphSignature(state.nodes, state.edges) !== state.baseline;
}

function summarize(
  result: RunResult,
  nodes: readonly WorkflowFlowNode[],
  registry: NodeRegistry,
): EditorFeedback {
  const label = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return nodeLabel(node && { id, type: node.data.nodeType, data: node.data.params }, registry);
  };
  switch (result.outcome) {
    case "invalid":
      return {
        tone: "error",
        title: "Le workflow n'est pas valide : rien n'a été exécuté.",
        details: result.issues.map((issue) => issue.message),
      };
    case "cancelled":
      return { tone: "info", title: "Exécution arrêtée." };
    case "failed":
      return {
        tone: "error",
        title: "L'exécution s'est terminée avec des erreurs.",
        details: Object.entries(result.states)
          .filter(([, state]) => state.status === "error")
          .map(([id, state]) => `${label(id)} : ${state.message ?? "erreur"}`),
      };
    case "succeeded": {
      const count = result.executed.length;
      return {
        tone: "success",
        title: `Exécution terminée : ${count} nœud${count > 1 ? "s" : ""} exécuté${count > 1 ? "s" : ""}.`,
      };
    }
  }
}

export function createWorkflowStore(
  registry: NodeRegistry = NODE_REGISTRY,
): StoreApi<WorkflowEditorState> {
  const emptySignature = graphSignature([], []);

  return createStore<WorkflowEditorState>()((set, get) => ({
    nodes: [],
    edges: [],
    workflowId: null,
    name: DEFAULT_WORKFLOW_NAME,
    baseline: emptySignature,
    runStates: {},
    running: false,
    controller: null,
    feedback: null,

    onNodesChange: (changes) => {
      const removed = new Set(changes.flatMap((c) => (c.type === "remove" ? [c.id] : [])));
      set((state) => {
        const nodes = applyNodeChanges(changes, state.nodes);
        if (removed.size === 0) return { nodes };
        const runStates = { ...state.runStates };
        for (const id of removed) delete runStates[id];
        return {
          nodes,
          edges: state.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
          runStates,
        };
      });
    },

    onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

    isValidConnection: (connection) => {
      const { nodes, edges } = get();
      return isConnectionValid(registry, nodes, edges, connection);
    },

    connect: (connection) => {
      if (!get().isValidConnection(connection)) return false;
      set((state) => ({ edges: connectEdges(state.edges, connection) }));
      return true;
    },

    addNode: (type, position, host) => {
      const definition = registry.get(type);
      if (!definition) return null;
      const { nodes } = get();
      const id = createNodeId(type, new Set(nodes.map((n) => n.id)));
      const params = { ...(definition.initialData?.(host) ?? definition.defaultData) };
      const node = createFlowNode(id, type, freePosition(nodes, position), params);
      set((state) => ({
        nodes: [...state.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node],
      }));
      return id;
    },

    updateParams: (nodeId, patch) => {
      set((state) => {
        const nodes = state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, params: { ...node.data.params, ...patch } } }
            : node,
        );
        const edges = pruneEdges(registry, nodes, state.edges);
        const removed = state.edges.length - edges.length;
        return {
          nodes,
          edges,
          ...(removed > 0 && {
            feedback: {
              tone: "info" as const,
              title:
                removed > 1
                  ? `${removed} liens devenus incompatibles ont été retirés.`
                  : "Un lien devenu incompatible a été retiré.",
            },
          }),
        };
      });
    },

    load: (graph, meta) => {
      get().controller?.abort();
      const { nodes, edges } = graphToFlow(graph);
      set({
        nodes,
        edges,
        workflowId: meta.id,
        name: meta.name,
        baseline: meta.id ? graphSignature(nodes, edges) : emptySignature,
        runStates: {},
        running: false,
        controller: null,
        feedback: null,
      });
    },

    reset: () => get().load(emptyGraph(), { id: null, name: DEFAULT_WORKFLOW_NAME }),

    markSaved: (id, name, signature) =>
      set((state) => ({
        workflowId: id,
        name,
        baseline: signature ?? graphSignature(state.nodes, state.edges),
      })),

    detach: () => set({ workflowId: null, baseline: emptySignature }),

    setFeedback: (feedback) => set({ feedback }),

    run: async ({ host, api, targetNodeId, clock }) => {
      if (get().running) return null;
      const controller = new AbortController();
      const { nodes, edges } = get();
      set({
        running: true,
        controller,
        feedback: { tone: "loading", title: "Exécution en cours…" },
      });
      try {
        const result = await runWorkflow(flowToGraph(nodes, edges), {
          registry,
          api,
          host,
          clock,
          targetNodeId,
          signal: controller.signal,
          onStateChange: (id, nodeState) => {
            if (get().controller !== controller) return; // graphe remplacé entre-temps
            set((state) => ({ runStates: { ...state.runStates, [id]: nodeState } }));
          },
        });
        if (get().controller === controller) {
          set({ feedback: summarize(result, nodes, registry) });
        }
        return result;
      } finally {
        if (get().controller === controller) set({ running: false, controller: null });
      }
    },

    stop: () => get().controller?.abort(),
  }));
}

/** Magasin partagé par l'éditeur. */
export const workflowStore = createWorkflowStore();

export function useWorkflowStore<T>(selector: (state: WorkflowEditorState) => T): T {
  return useStore(workflowStore, selector);
}
