/**
 * Types du moteur d'exécution (TypeScript pur : ni React, ni DOM).
 * Les définitions de nœuds de l'interface (`nodes/definition.ts`) étendent
 * `EngineNodeDefinition` avec ce qui relève de l'affichage.
 */
import type { WorkflowHost } from "../host";
import type { NodeData } from "../model/graph";
import type { Port } from "../model/ports";
import type { WorkflowValue } from "../model/values";
import type { Clock, WorkflowServices } from "../services";

export type NodeStatus = "idle" | "queued" | "running" | "done" | "error" | "skipped";

export interface NodeRunState {
  status: NodeStatus;
  /** Message affiché sous le nœud (progression, résultat, erreur). */
  message?: string;
  /** Avancement entre 0 et 1 ; absent = indéterminé. */
  progress?: number;
  /** Valeurs produites, par identifiant de port de sortie. */
  outputs?: Readonly<Record<string, WorkflowValue>>;
  /** Valeur à prévisualiser dans le nœud (média ou texte). */
  preview?: WorkflowValue;
  /** Tous les médias produits (ex. les N images d'une génération Kling). */
  mediaIds?: readonly string[];
  startedAt?: number;
  finishedAt?: number;
}

export interface NodeProgress {
  message?: string;
  /** Entre 0 et 1. */
  value?: number;
}

/** Contexte transmis à chaque exécuteur. */
export interface ExecutionContext {
  host: WorkflowHost | null;
  api: WorkflowServices;
  signal: AbortSignal;
  clock: Clock;
  reportProgress(progress: NodeProgress): void;
}

/** Valeurs reçues, par identifiant de port d'entrée (absente si non connectée). */
export type NodeInputs = Readonly<Record<string, WorkflowValue | undefined>>;

export interface NodeExecutionResult {
  /** Une valeur par port de sortie déclaré. */
  outputs?: Record<string, WorkflowValue>;
  message?: string;
  preview?: WorkflowValue;
  mediaIds?: string[];
}

/** Ports fixes, ou dépendant des paramètres (ex. média image ou vidéo). */
export type PortList<D = NodeData> = readonly Port[] | ((data: D) => readonly Port[]);

/** Ce dont le moteur a besoin pour valider et exécuter un type de nœud. */
export interface EngineNodeDefinition<D = NodeData> {
  type: string;
  title: string;
  inputs: PortList<D>;
  outputs: PortList<D>;
  defaultData: D;
  /** Erreurs de configuration détectées avant l'exécution (messages en français). */
  validate?(data: D, env: { host: WorkflowHost | null }): string[];
  execute(
    ctx: ExecutionContext,
    inputs: NodeInputs,
    data: D,
    signal: AbortSignal,
  ): Promise<NodeExecutionResult>;
}

export interface EngineRegistry {
  get(type: string): EngineNodeDefinition | undefined;
}

/** Sous-ensemble du graphe utile au moteur (les positions sont ignorées). */
export interface EngineNode {
  id: string;
  type: string;
  data: NodeData;
}

export interface EngineEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface EngineGraph {
  nodes: readonly EngineNode[];
  edges: readonly EngineEdge[];
}

export type IssueCode =
  | "empty-graph"
  | "unknown-target"
  | "unknown-type"
  | "dangling-edge"
  | "unknown-port"
  | "type-mismatch"
  | "duplicate-input"
  | "missing-input"
  | "cycle"
  | "node-config";

export interface ValidationIssue {
  code: IssueCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/** Paramètres effectifs : valeurs par défaut complétées par celles du graphe. */
export function resolveData<D>(definition: EngineNodeDefinition<D>, data: NodeData | undefined): D {
  return { ...definition.defaultData, ...(data ?? {}) } as D;
}

export function resolvePorts<D>(list: PortList<D>, data: D): readonly Port[] {
  return typeof list === "function" ? list(data) : list;
}

export function inputPorts(definition: EngineNodeDefinition, data: NodeData | undefined) {
  return resolvePorts(definition.inputs, resolveData(definition, data));
}

export function outputPorts(definition: EngineNodeDefinition, data: NodeData | undefined) {
  return resolvePorts(definition.outputs, resolveData(definition, data));
}
