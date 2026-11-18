/**
 * Onglet Workflow : éditeur de graphes à nœuds (médias, prompts, étapes IA)
 * et moteur d'exécution. Voir README.md.
 */
export { WorkflowEditor, type WorkflowEditorProps } from "./components/WorkflowEditor";
export type { WorkflowHost } from "./host";

// Graphe enregistré et (dé)sérialisation
export {
  emptyGraph,
  GRAPH_LIMITS,
  GRAPH_VERSION,
  graphSize,
  nameFromFileName,
  normalizeWorkflowName,
  parseWorkflowGraph,
  workflowFileName,
  workflowNameError,
  type GraphEdge,
  type GraphNode,
  type NodeData,
  type ParseResult,
  type WorkflowGraph,
} from "./model/graph";
export {
  edgeId,
  flowToGraph,
  graphToFlow,
  FLOW_NODE_TYPE,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
  type WorkflowNodeData,
} from "./model/flow";
export { canConnect, PORT_TYPE_LABELS, type Port, type PortType } from "./model/ports";
export type { WorkflowValue } from "./model/values";

// Registre des nœuds
export { NODE_REGISTRY, createNodeRegistry, type NodeRegistry } from "./nodes/registry";
export {
  CATEGORIES,
  defineNode,
  type NodeCategory,
  type NodeDefinition,
  type ParamsProps,
} from "./nodes/definition";

// Moteur
export { runWorkflow, type RunOptions, type RunOutcome, type RunResult } from "./engine/run";
export { validateGraph, type ValidateOptions } from "./engine/validate";
export type {
  ExecutionContext,
  NodeExecutionResult,
  NodeRunState,
  NodeStatus,
  ValidationIssue,
} from "./engine/types";
export {
  defaultWorkflowServices,
  systemClock,
  type Clock,
  type WorkflowServices,
} from "./services";

// Modèles
export { instantiateTemplate, TEMPLATES, type WorkflowTemplate } from "./templates/templates";
