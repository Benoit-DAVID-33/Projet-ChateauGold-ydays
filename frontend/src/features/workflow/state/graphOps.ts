/**
 * Opérations pures sur l'état React Flow du workflow (testées sans DOM) :
 * compatibilité des connexions, ajout de nœud, nettoyage des liens.
 */
import type { Connection, Edge, XYPosition } from "@xyflow/react";

import { wouldCreateCycle } from "../engine/topology";
import { inputPorts, outputPorts } from "../engine/types";
import {
  edgeId,
  FLOW_NODE_TYPE,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from "../model/flow";
import type { NodeData } from "../model/graph";
import { canConnect, findPort, type Port } from "../model/ports";
import type { NodeRegistry } from "../nodes/registry";

/** Largeur des nœuds (px) : sert à centrer un nœud ajouté depuis la palette. */
export const NODE_WIDTH = 280;

export function portsOf(
  registry: NodeRegistry,
  node: Pick<WorkflowFlowNode, "data"> | undefined,
): { inputs: readonly Port[]; outputs: readonly Port[] } {
  const definition = node && registry.get(node.data.nodeType);
  if (!node || !definition) return { inputs: [], outputs: [] };
  return {
    inputs: inputPorts(definition, node.data.params),
    outputs: outputPorts(definition, node.data.params),
  };
}

/** Type du port de sortie d'un lien (pour colorer le lien). */
export function edgePortType(
  registry: NodeRegistry,
  nodes: readonly WorkflowFlowNode[],
  edge: Pick<Edge, "source" | "sourceHandle">,
) {
  const source = nodes.find((node) => node.id === edge.source);
  return findPort(portsOf(registry, source).outputs, edge.sourceHandle)?.type;
}

/**
 * Connexion autorisée ? Ports existants, types compatibles, pas de boucle.
 * Le lien déjà branché sur l'entrée visée sera remplacé : il est ignoré ici.
 */
export function isConnectionValid(
  registry: NodeRegistry,
  nodes: readonly WorkflowFlowNode[],
  edges: readonly WorkflowFlowEdge[],
  connection: Connection | Edge,
): boolean {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!source || !target || !sourceHandle || !targetHandle || source === target) return false;
  const out = findPort(
    portsOf(
      registry,
      nodes.find((n) => n.id === source),
    ).outputs,
    sourceHandle,
  );
  const input = findPort(
    portsOf(
      registry,
      nodes.find((n) => n.id === target),
    ).inputs,
    targetHandle,
  );
  if (!out || !input || !canConnect(out.type, input.type)) return false;
  const remaining = edges.filter((e) => !(e.target === target && e.targetHandle === targetHandle));
  return !wouldCreateCycle(remaining, source, target);
}

/** Ajoute le lien ; une entrée n'accepte qu'un lien (l'ancien est remplacé). */
export function connectEdges(
  edges: readonly WorkflowFlowEdge[],
  connection: Connection,
): WorkflowFlowEdge[] {
  const { source, target } = connection;
  const sourceHandle = connection.sourceHandle ?? "";
  const targetHandle = connection.targetHandle ?? "";
  return [
    ...edges.filter((e) => !(e.target === target && e.targetHandle === targetHandle)),
    {
      id: edgeId(source, sourceHandle, target, targetHandle),
      source,
      sourceHandle,
      target,
      targetHandle,
    },
  ];
}

/** Retire les liens devenus invalides (port disparu ou type incompatible). */
export function pruneEdges(
  registry: NodeRegistry,
  nodes: readonly WorkflowFlowNode[],
  edges: readonly WorkflowFlowEdge[],
): WorkflowFlowEdge[] {
  return edges.filter((edge) => {
    const out = findPort(
      portsOf(
        registry,
        nodes.find((n) => n.id === edge.source),
      ).outputs,
      edge.sourceHandle,
    );
    const input = findPort(
      portsOf(
        registry,
        nodes.find((n) => n.id === edge.target),
      ).inputs,
      edge.targetHandle,
    );
    return Boolean(out && input && canConnect(out.type, input.type));
  });
}

export function createNodeId(type: string, existing: ReadonlySet<string>): string {
  for (;;) {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    if (!existing.has(id)) return id;
  }
}

/** Décale la position tant qu'un nœud occupe déjà exactement cet endroit. */
export function freePosition(nodes: readonly WorkflowFlowNode[], position: XYPosition): XYPosition {
  let { x, y } = position;
  while (
    nodes.some((node) => Math.abs(node.position.x - x) < 8 && Math.abs(node.position.y - y) < 8)
  ) {
    x += 32;
    y += 32;
  }
  return { x, y };
}

export function createFlowNode(
  id: string,
  nodeType: string,
  position: XYPosition,
  params: NodeData,
): WorkflowFlowNode {
  return { id, type: FLOW_NODE_TYPE, position, data: { nodeType, params }, selected: true };
}
