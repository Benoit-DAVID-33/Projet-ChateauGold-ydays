/**
 * Définition complète d'un type de nœud : partie moteur (ports, exécution)
 * et partie interface (titre, catégorie, icône, panneau de paramètres).
 * Ajouter un type de nœud = créer un fichier `nodes/<nom>.node.tsx` qui exporte
 * `node = defineNode({...})` (voir README.md).
 */
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { EngineNodeDefinition } from "../engine/types";
import type { WorkflowHost } from "../host";
import type { NodeData } from "../model/graph";
import type { WorkflowServices } from "../services";

export type NodeCategory = "sources" | "text" | "kling" | "processing" | "output";

export const CATEGORIES: readonly { id: NodeCategory; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "text", label: "Texte et IA" },
  { id: "kling", label: "Génération Kling" },
  { id: "processing", label: "Traitement" },
  { id: "output", label: "Sortie" },
];

export interface ParamsProps<D> {
  nodeId: string;
  data: D;
  /** Met à jour une partie des paramètres. */
  onChange(patch: Partial<D>): void;
  host: WorkflowHost | null;
  api: WorkflowServices;
  /** Vrai pendant une exécution : les champs sont en lecture seule. */
  disabled: boolean;
}

export interface NodeDefinition<D = NodeData> extends EngineNodeDefinition<D> {
  category: NodeCategory;
  description: string;
  icon: LucideIcon;
  /** Panneau de paramètres affiché dans le nœud (null si aucun paramètre). */
  Params: ComponentType<ParamsProps<D>> | null;
  /** Paramètres initiaux à la création depuis la palette (sinon `defaultData`). */
  initialData?(host: WorkflowHost | null): D;
}

/**
 * Déclare un type de nœud avec des paramètres typés `D`. Le registre manipule
 * des définitions « effacées » (`NodeDefinition<NodeData>`) : le moteur
 * complète toujours `data` avec `defaultData` avant de l'utiliser.
 */
export function defineNode<D extends object>(definition: NodeDefinition<D>): NodeDefinition {
  return definition as unknown as NodeDefinition;
}
