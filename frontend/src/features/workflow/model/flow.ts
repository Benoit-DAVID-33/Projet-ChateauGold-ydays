/**
 * Conversion entre le graphe enregistré (`WorkflowGraph`) et l'état React Flow.
 *
 * Côté React Flow, tous les nœuds ont le type technique `workflow` (un seul
 * composant de rendu) ; le type métier et les paramètres vivent dans `data`.
 */
import type { Edge, Node } from "@xyflow/react";

import { GRAPH_VERSION, type NodeData, type WorkflowGraph } from "./graph";

export const FLOW_NODE_TYPE = "workflow";

export type WorkflowNodeData = {
  /** Type métier (clé du registre de nœuds). */
  nodeType: string;
  /** Paramètres propres au nœud (sérialisés tels quels dans `data`). */
  params: NodeData;
};

export type WorkflowFlowNode = Node<WorkflowNodeData, typeof FLOW_NODE_TYPE>;
export type WorkflowFlowEdge = Edge;

export interface FlowState {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
}

/** Identifiant déterministe d'un lien (un seul lien par couple de ports). */
export function edgeId(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): string {
  return `e:${source}:${sourceHandle}->${target}:${targetHandle}`;
}

/** Graphe enregistré -> nœuds et liens React Flow. */
export function graphToFlow(graph: WorkflowGraph): FlowState {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: FLOW_NODE_TYPE,
      position: { x: node.position.x, y: node.position.y },
      data: { nodeType: node.type, params: { ...node.data } },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    })),
  };
}

/** Nœuds et liens React Flow -> graphe enregistré (positions arrondies au pixel). */
export function flowToGraph(
  nodes: readonly WorkflowFlowNode[],
  edges: readonly Edge[],
): WorkflowGraph {
  return {
    version: GRAPH_VERSION,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      data: { ...node.data.params },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? "",
      target: edge.target,
      targetHandle: edge.targetHandle ?? "",
    })),
  };
}
