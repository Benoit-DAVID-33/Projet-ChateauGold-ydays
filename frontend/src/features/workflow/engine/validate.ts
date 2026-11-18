/**
 * Validation d'un graphe avant exécution : types inconnus, liens orphelins,
 * ports inconnus, types incompatibles, entrées multiples ou manquantes, cycles
 * et configuration propre à chaque nœud. Messages en français, prêts à afficher.
 */
import type { WorkflowHost } from "../host";
import { canConnect, findPort, PORT_TYPE_LABELS } from "../model/ports";
import { findCycle } from "./topology";
import {
  inputPorts,
  outputPorts,
  resolveData,
  type EngineGraph,
  type EngineNode,
  type EngineRegistry,
  type ValidationIssue,
} from "./types";

export interface ValidateOptions {
  /** Nœuds à vérifier (par défaut : tous). Les liens vérifiés sont ceux qui y entrent. */
  scope?: ReadonlySet<string>;
  /** Active les vérifications de configuration des nœuds (`definition.validate`). */
  nodeChecks?: { host: WorkflowHost | null };
}

/** Libellé d'un nœud dans les messages : « Titre ». */
export function nodeLabel(node: EngineNode | undefined, registry: EngineRegistry): string {
  if (!node) return "« nœud inconnu »";
  return `« ${registry.get(node.type)?.title ?? node.type} »`;
}

export function validateGraph(
  graph: EngineGraph,
  registry: EngineRegistry,
  options: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const inScope = (id: string) => !options.scope || options.scope.has(id);
  const scopedNodes = graph.nodes.filter((node) => inScope(node.id));
  const label = (id: string) => nodeLabel(byId.get(id), registry);

  if (graph.nodes.length === 0) {
    return [
      {
        code: "empty-graph",
        message: "Le workflow est vide : ajoutez des nœuds depuis la palette.",
      },
    ];
  }

  for (const node of scopedNodes) {
    if (!registry.get(node.type)) {
      issues.push({
        code: "unknown-type",
        nodeId: node.id,
        message: `Type de nœud inconnu « ${node.type} » : supprimez ce nœud ou mettez l'application à jour.`,
      });
    }
  }

  const scopedEdges = graph.edges.filter((edge) => inScope(edge.target));
  const inputCounts = new Map<string, number>();
  for (const edge of scopedEdges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      issues.push({
        code: "dangling-edge",
        edgeId: edge.id,
        message: "Un lien référence un nœud qui n'existe plus : supprimez-le.",
      });
      continue;
    }
    const sourceDef = registry.get(source.type);
    const targetDef = registry.get(target.type);
    if (!sourceDef || !targetDef) continue; // déjà signalé (type inconnu)

    const out = findPort(outputPorts(sourceDef, source.data), edge.sourceHandle);
    const input = findPort(inputPorts(targetDef, target.data), edge.targetHandle);
    if (!out) {
      issues.push({
        code: "unknown-port",
        edgeId: edge.id,
        nodeId: source.id,
        message: `${label(source.id)} n'a pas de sortie « ${edge.sourceHandle} » : supprimez le lien correspondant.`,
      });
      continue;
    }
    if (!input) {
      issues.push({
        code: "unknown-port",
        edgeId: edge.id,
        nodeId: target.id,
        message: `${label(target.id)} n'a pas d'entrée « ${edge.targetHandle} » : supprimez le lien correspondant.`,
      });
      continue;
    }
    const key = JSON.stringify([target.id, input.id]);
    inputCounts.set(key, (inputCounts.get(key) ?? 0) + 1);
    if (inputCounts.get(key) === 2) {
      issues.push({
        code: "duplicate-input",
        nodeId: target.id,
        edgeId: edge.id,
        message: `${label(target.id)} : l'entrée « ${input.label} » reçoit plusieurs liens (un seul autorisé).`,
      });
    }
    if (!canConnect(out.type, input.type)) {
      issues.push({
        code: "type-mismatch",
        nodeId: target.id,
        edgeId: edge.id,
        message:
          `Types incompatibles : la sortie « ${out.label} » (${PORT_TYPE_LABELS[out.type]}) de ` +
          `${label(source.id)} ne peut pas alimenter l'entrée « ${input.label} » ` +
          `(${PORT_TYPE_LABELS[input.type]}) de ${label(target.id)}.`,
      });
    }
  }

  for (const node of scopedNodes) {
    const definition = registry.get(node.type);
    if (!definition) continue;
    for (const port of inputPorts(definition, node.data)) {
      if (port.optional) continue;
      const connected = scopedEdges.some(
        (edge) => edge.target === node.id && edge.targetHandle === port.id && byId.has(edge.source),
      );
      if (!connected) {
        issues.push({
          code: "missing-input",
          nodeId: node.id,
          message: `${label(node.id)} : l'entrée obligatoire « ${port.label} » n'est pas connectée.`,
        });
      }
    }
  }

  const cycle = findCycle(
    scopedNodes.map((node) => node.id),
    scopedEdges,
  );
  if (cycle) {
    issues.push({
      code: "cycle",
      nodeId: cycle[0],
      message: `Le workflow contient une boucle (${cycle.map(label).join(" puis ")}) : supprimez un lien pour la casser.`,
    });
  }

  if (options.nodeChecks) {
    const env = { host: options.nodeChecks.host };
    for (const node of scopedNodes) {
      const definition = registry.get(node.type);
      if (!definition?.validate) continue;
      for (const message of definition.validate(resolveData(definition, node.data), env)) {
        issues.push({
          code: "node-config",
          nodeId: node.id,
          message: `${label(node.id)} : ${message}`,
        });
      }
    }
  }

  return issues;
}
