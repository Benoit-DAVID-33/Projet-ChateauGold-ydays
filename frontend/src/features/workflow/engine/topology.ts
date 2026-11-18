/** Algorithmes de graphe orienté (déterministes : l'ordre des nœuds départage). */

interface Link {
  source: string;
  target: string;
}

/**
 * Tri topologique de Kahn. Parmi les nœuds prêts, celui qui apparaît le plus
 * tôt dans `nodeIds` passe en premier : l'ordre est donc stable et prévisible.
 * Les nœuds pris dans un cycle (ou en aval d'un cycle) sont renvoyés à part.
 */
export function topologicalOrder(
  nodeIds: readonly string[],
  links: readonly Link[],
): { order: string[]; blocked: string[] } {
  const rank = new Map(nodeIds.map((id, index) => [id, index]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const successors = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const { source, target } of links) {
    if (!rank.has(source) || !rank.has(target)) continue;
    successors.get(source)?.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const ready = nodeIds.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    const id = ready.shift() as string;
    order.push(id);
    for (const next of successors.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  const done = new Set(order);
  return { order, blocked: nodeIds.filter((id) => !done.has(id)) };
}

/**
 * Renvoie un cycle sous la forme [a, b, …, a], ou null s'il n'y en a pas
 * (parcours en profondeur itératif, nœuds visités dans l'ordre de `nodeIds`).
 */
export function findCycle(nodeIds: readonly string[], links: readonly Link[]): string[] | null {
  const known = new Set(nodeIds);
  const successors = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const { source, target } of links) {
    if (known.has(source) && known.has(target)) successors.get(source)?.push(target);
  }
  const state = new Map<string, "visiting" | "done">();

  for (const start of nodeIds) {
    if (state.has(start)) continue;
    const path: string[] = [start];
    const cursors: number[] = [0];
    state.set(start, "visiting");
    while (path.length > 0) {
      const current = path[path.length - 1] as string;
      const nexts = successors.get(current) ?? [];
      const cursor = cursors[cursors.length - 1] as number;
      if (cursor >= nexts.length) {
        state.set(current, "done");
        path.pop();
        cursors.pop();
        continue;
      }
      cursors[cursors.length - 1] = cursor + 1;
      const next = nexts[cursor] as string;
      const seen = state.get(next);
      if (seen === "visiting") return [...path.slice(path.indexOf(next)), next];
      if (seen === undefined) {
        state.set(next, "visiting");
        path.push(next);
        cursors.push(0);
      }
    }
  }
  return null;
}

/** Tous les nœuds en amont de `nodeId` (lui-même exclu). */
export function ancestorsOf(nodeId: string, links: readonly Link[]): Set<string> {
  const result = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const link of links) {
      if (link.target === current && !result.has(link.source) && link.source !== nodeId) {
        result.add(link.source);
        stack.push(link.source);
      }
    }
  }
  return result;
}

/** Ajouter le lien source -> target créerait-il un cycle ? */
export function wouldCreateCycle(links: readonly Link[], source: string, target: string): boolean {
  return source === target || ancestorsOf(source, links).has(target);
}
