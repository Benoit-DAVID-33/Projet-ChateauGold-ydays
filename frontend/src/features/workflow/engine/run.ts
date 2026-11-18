/**
 * Exécution d'un workflow.
 *
 * 1. Validation de la portée (tout le graphe, ou un nœud et ses ancêtres pour
 *    « Exécuter jusqu'ici ») : si elle échoue, rien n'est exécuté.
 * 2. Ordre topologique déterministe ; les nœuds s'exécutent un par un.
 * 3. Un nœud dont une entrée n'a pas abouti est « ignoré » ; les branches
 *    indépendantes continuent.
 * 4. Annulation via AbortSignal : le nœud en cours est interrompu, les suivants
 *    sont ignorés.
 */
import { errorMessage } from "@/shared/api/client";

import type { WorkflowHost } from "../host";
import { describeValue, valueMatchesPort, type WorkflowValue } from "../model/values";
import { systemClock, type Clock, type WorkflowServices } from "../services";
import { ancestorsOf, topologicalOrder } from "./topology";
import {
  outputPorts,
  resolveData,
  type EngineGraph,
  type EngineRegistry,
  type NodeRunState,
  type ValidationIssue,
} from "./types";
import { nodeLabel, validateGraph } from "./validate";

export interface RunOptions {
  registry: EngineRegistry;
  api: WorkflowServices;
  host?: WorkflowHost | null;
  clock?: Clock;
  signal?: AbortSignal;
  /** « Exécuter jusqu'ici » : seul ce nœud et ses ancêtres sont exécutés. */
  targetNodeId?: string;
  /** Appelé à chaque changement d'état d'un nœud (état complet, immuable). */
  onStateChange?(nodeId: string, state: NodeRunState): void;
}

export type RunOutcome = "succeeded" | "failed" | "cancelled" | "invalid";

export interface RunResult {
  outcome: RunOutcome;
  issues: ValidationIssue[];
  /** États finaux des nœuds de la portée. */
  states: Record<string, NodeRunState>;
  /** Ordre d'exécution effectif (nœuds réellement lancés). */
  executed: string[];
}

export const CANCELLED_MESSAGE = "Interrompu : exécution arrêtée.";
export const NOT_RUN_MESSAGE = "Non exécuté : exécution arrêtée.";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export async function runWorkflow(graph: EngineGraph, options: RunOptions): Promise<RunResult> {
  const { registry, api, onStateChange } = options;
  const host = options.host ?? null;
  const clock = options.clock ?? systemClock;
  const signal = options.signal ?? new AbortController().signal;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const states: Record<string, NodeRunState> = {};
  const executed: string[] = [];

  const setState = (id: string, state: NodeRunState) => {
    states[id] = state;
    onStateChange?.(id, state);
  };

  // --- Portée -------------------------------------------------------------
  const target = options.targetNodeId;
  if (target !== undefined && !byId.has(target)) {
    return {
      outcome: "invalid",
      issues: [{ code: "unknown-target", message: "Le nœud ciblé n'existe plus." }],
      states,
      executed,
    };
  }
  const scope = new Set(
    target === undefined
      ? graph.nodes.map((node) => node.id)
      : [...ancestorsOf(target, graph.edges), target],
  );
  const scopedIds = graph.nodes.filter((node) => scope.has(node.id)).map((node) => node.id);
  const scopedEdges = graph.edges.filter(
    (edge) => scope.has(edge.target) && scope.has(edge.source),
  );

  // --- Validation -----------------------------------------------------------
  const issues = validateGraph(graph, registry, { scope, nodeChecks: { host } });
  if (issues.length > 0) {
    const messages = new Map<string, string[]>();
    for (const issue of issues) {
      if (issue.nodeId && scope.has(issue.nodeId))
        messages.set(issue.nodeId, [...(messages.get(issue.nodeId) ?? []), issue.message]);
    }
    for (const id of scopedIds) {
      const list = messages.get(id);
      setState(id, list ? { status: "error", message: list.join("\n") } : { status: "idle" });
    }
    return { outcome: "invalid", issues, states, executed };
  }

  // --- Exécution ------------------------------------------------------------
  const { order } = topologicalOrder(scopedIds, scopedEdges);
  for (const id of order) setState(id, { status: "queued" });
  const produced = new Map<string, Readonly<Record<string, WorkflowValue>>>();
  let failed = false;

  for (const id of order) {
    const node = byId.get(id);
    const definition = node && registry.get(node.type);
    if (!node || !definition) continue; // impossible après validation

    if (signal.aborted) {
      setState(id, { status: "skipped", message: NOT_RUN_MESSAGE });
      continue;
    }

    const incoming = scopedEdges.filter((edge) => edge.target === id);
    const blocker = incoming.find((edge) => states[edge.source]?.status !== "done");
    if (blocker) {
      setState(id, {
        status: "skipped",
        message: `Ignoré : ${nodeLabel(byId.get(blocker.source), registry)} n'a pas abouti.`,
      });
      continue;
    }

    const inputs: Record<string, WorkflowValue | undefined> = {};
    for (const edge of incoming)
      inputs[edge.targetHandle] = produced.get(edge.source)?.[edge.sourceHandle];

    const data = resolveData(definition, node.data);
    const startedAt = clock.now();
    let finished = false;
    setState(id, { status: "running", startedAt });
    executed.push(id);

    const ctx = {
      host,
      api,
      signal,
      clock,
      reportProgress: (progress: { message?: string; value?: number }) => {
        if (finished) return;
        const current = states[id] ?? { status: "running" as const };
        setState(id, {
          ...current,
          ...(progress.message !== undefined && { message: progress.message }),
          ...(progress.value !== undefined && { progress: clamp01(progress.value) }),
        });
      },
    };

    try {
      const result = await definition.execute(ctx, inputs, data, signal);
      finished = true;
      const outputs = result.outputs ?? {};
      for (const port of outputPorts(definition, node.data)) {
        const value = outputs[port.id];
        if (!value) throw new Error(`La sortie « ${port.label} » n'a pas été produite.`);
        if (!valueMatchesPort(value, port.type))
          throw new Error(
            `La sortie « ${port.label} » a reçu ${describeValue(value)}, type inattendu.`,
          );
      }
      setState(id, {
        status: "done",
        startedAt,
        finishedAt: clock.now(),
        outputs,
        ...(result.message !== undefined && { message: result.message }),
        ...(result.preview !== undefined && { preview: result.preview }),
        ...(result.mediaIds !== undefined && { mediaIds: result.mediaIds }),
      });
      produced.set(id, outputs);
    } catch (error) {
      finished = true;
      if (signal.aborted) {
        setState(id, {
          status: "skipped",
          message: CANCELLED_MESSAGE,
          startedAt,
          finishedAt: clock.now(),
        });
      } else {
        failed = true;
        setState(id, {
          status: "error",
          message: errorMessage(error),
          startedAt,
          finishedAt: clock.now(),
        });
      }
    }
  }

  const outcome: RunOutcome = signal.aborted ? "cancelled" : failed ? "failed" : "succeeded";
  return { outcome, issues: [], states, executed };
}
