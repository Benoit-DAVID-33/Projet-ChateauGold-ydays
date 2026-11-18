/**
 * Registre des types de nœuds. Les modules `*.node.tsx` de ce dossier sont
 * découverts automatiquement : ajouter un nœud ne modifie aucun fichier existant.
 */
import { CATEGORIES, type NodeCategory, type NodeDefinition } from "./definition";

export interface NodeRegistry {
  get(type: string): NodeDefinition | undefined;
  /** Toutes les définitions, triées par catégorie puis par titre. */
  list(): readonly NodeDefinition[];
  byCategory(): readonly { id: NodeCategory; label: string; nodes: readonly NodeDefinition[] }[];
}

const categoryRank = (category: NodeCategory) => CATEGORIES.findIndex((c) => c.id === category);

export function createNodeRegistry(definitions: readonly NodeDefinition[]): NodeRegistry {
  const map = new Map<string, NodeDefinition>();
  for (const definition of definitions) {
    if (map.has(definition.type))
      throw new Error(`Type de nœud « ${definition.type} » déclaré deux fois.`);
    map.set(definition.type, definition);
  }
  const sorted = [...map.values()].sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) || a.title.localeCompare(b.title, "fr"),
  );
  const grouped = CATEGORIES.map((category) => ({
    ...category,
    nodes: sorted.filter((definition) => definition.category === category.id),
  })).filter((group) => group.nodes.length > 0);

  return {
    get: (type) => map.get(type),
    list: () => sorted,
    byCategory: () => grouped,
  };
}

interface NodeModule {
  node?: NodeDefinition;
}

const modules = import.meta.glob<NodeModule>("./*.node.tsx", { eager: true });

function collect(found: Record<string, NodeModule>): NodeDefinition[] {
  return Object.entries(found).map(([path, module]) => {
    if (!module.node) throw new Error(`${path} doit exporter « node = defineNode(...) ».`);
    return module.node;
  });
}

/** Registre par défaut : tous les nœuds livrés avec l'application. */
export const NODE_REGISTRY: NodeRegistry = createNodeRegistry(collect(modules));
