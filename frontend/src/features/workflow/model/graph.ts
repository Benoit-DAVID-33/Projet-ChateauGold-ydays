/**
 * Format enregistré d'un workflow (contrat avec le backend `/api/workflows`) :
 *
 *   { version: 1,
 *     nodes: [{ id, type, position: { x, y }, data }],
 *     edges: [{ id, source, sourceHandle, target, targetHandle }] }
 *
 * Le backend vérifie la version, les identifiants et types de nœuds, que les
 * liens référencent des nœuds existants, au plus 200 nœuds, 500 liens et 512 Ko.
 * `parseWorkflowGraph` applique les mêmes règles (et un peu plus) côté client,
 * pour l'import JSON et avant tout enregistrement.
 */

export const GRAPH_VERSION = 1;

export const GRAPH_LIMITS = {
  maxNodes: 200,
  maxEdges: 500,
  /** Taille maximale du JSON compact (mesurée comme le backend, voir `graphSize`). */
  maxBytes: 512 * 1024,
} as const;

export const WORKFLOW_NAME_MAX_LENGTH = 120;

export type NodeData = Record<string, unknown>;

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowGraph {
  version: typeof GRAPH_VERSION;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type ParseResult = { ok: true; graph: WorkflowGraph } | { ok: false; error: string };

export function emptyGraph(): WorkflowGraph {
  return { version: GRAPH_VERSION, nodes: [], edges: [] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Taille du JSON compact telle que la calcule le backend
 * (`len(json.dumps(graph, separators=(",", ":")))`, donc `ensure_ascii`) :
 * chaque unité UTF-16 non ASCII compte pour une séquence `\uXXXX` (6 caractères).
 */
export function graphSize(graph: unknown): number {
  const json = JSON.stringify(graph) ?? "";
  let size = 0;
  for (let i = 0; i < json.length; i += 1) size += json.charCodeAt(i) < 0x80 ? 1 : 6;
  return size;
}

/**
 * Valide et normalise un graphe venant de l'extérieur (fichier importé,
 * réponse du serveur). Les types de nœuds inconnus sont acceptés ici : ils sont
 * signalés par la validation d'exécution, pas à l'ouverture.
 */
export function parseWorkflowGraph(raw: unknown): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, error });
  if (!isRecord(raw)) return fail("Le graphe doit être un objet JSON.");
  if (raw.version !== GRAPH_VERSION)
    return fail(`Version de graphe non supportée (attendue : ${GRAPH_VERSION}).`);
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges))
    return fail("Le graphe doit contenir les listes « nodes » et « edges ».");
  if (raw.nodes.length > GRAPH_LIMITS.maxNodes || raw.edges.length > GRAPH_LIMITS.maxEdges)
    return fail(
      `Graphe trop grand (maximum ${GRAPH_LIMITS.maxNodes} nœuds et ${GRAPH_LIMITS.maxEdges} liens).`,
    );

  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  for (const [index, node] of raw.nodes.entries()) {
    const where = `Nœud ${index + 1}`;
    if (!isRecord(node) || !isNonEmptyString(node.id))
      return fail(`${where} : identifiant manquant.`);
    if (ids.has(node.id)) return fail(`${where} : identifiant « ${node.id} » en double.`);
    if (!isNonEmptyString(node.type)) return fail(`${where} : type manquant.`);
    const position = node.position;
    if (!isRecord(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.y))
      return fail(`${where} : position invalide.`);
    if (node.data !== undefined && !isRecord(node.data))
      return fail(`${where} : les paramètres (« data ») doivent être un objet.`);
    ids.add(node.id);
    nodes.push({
      id: node.id,
      type: node.type,
      position: { x: position.x, y: position.y },
      data: { ...(node.data ?? {}) },
    });
  }

  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  for (const [index, edge] of raw.edges.entries()) {
    const where = `Lien ${index + 1}`;
    if (!isRecord(edge)) return fail(`${where} : lien invalide.`);
    const { id, source, sourceHandle, target, targetHandle } = edge;
    if (!isNonEmptyString(id)) return fail(`${where} : identifiant manquant.`);
    if (edgeIds.has(id)) return fail(`${where} : identifiant « ${id} » en double.`);
    if (
      !isNonEmptyString(source) ||
      !isNonEmptyString(target) ||
      !ids.has(source) ||
      !ids.has(target)
    )
      return fail(`${where} : référence un nœud inexistant.`);
    if (!isNonEmptyString(sourceHandle) || !isNonEmptyString(targetHandle))
      return fail(`${where} : ports (« sourceHandle », « targetHandle ») manquants.`);
    edgeIds.add(id);
    edges.push({ id, source, sourceHandle, target, targetHandle });
  }

  const graph: WorkflowGraph = { version: GRAPH_VERSION, nodes, edges };
  if (graphSize(graph) > GRAPH_LIMITS.maxBytes)
    return fail("Graphe trop volumineux (512 Ko maximum).");
  return { ok: true, graph };
}

/** Normalise un nom comme le backend (espaces fusionnés, bords retirés). */
export function normalizeWorkflowName(name: string): string {
  return name.split(/\s+/).filter(Boolean).join(" ");
}

/** Message d'erreur pour un nom invalide, ou null. */
export function workflowNameError(name: string): string | null {
  const clean = normalizeWorkflowName(name);
  if (!clean) return "Le nom du workflow est requis.";
  if (clean.length > WORKFLOW_NAME_MAX_LENGTH)
    return `Nom trop long (${WORKFLOW_NAME_MAX_LENGTH} caractères maximum).`;
  return null;
}

/** Nom de fichier d'export (`mon-workflow.json`). */
export function workflowFileName(name: string): string {
  const base = normalizeWorkflowName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "workflow"}.json`;
}

/** Nom proposé à partir d'un fichier importé (« Mon workflow.json » donne « Mon workflow »). */
export function nameFromFileName(fileName: string): string {
  const clean = normalizeWorkflowName(fileName.replace(/\.json$/i, "").replace(/[-_]+/g, " "));
  return clean.slice(0, WORKFLOW_NAME_MAX_LENGTH) || "Workflow importé";
}
