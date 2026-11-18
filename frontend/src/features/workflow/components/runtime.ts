/** Dépendances partagées par les composants de l'éditeur (hôte, API, registre). */
import { createContext, useContext } from "react";

import type { WorkflowHost } from "../host";
import type { NodeCategory } from "../nodes/definition";
import type { NodeRegistry } from "../nodes/registry";
import type { PortType } from "../model/ports";
import type { WorkflowServices } from "../services";

export interface WorkflowRuntime {
  host: WorkflowHost | null;
  services: WorkflowServices;
  registry: NodeRegistry;
}

export const WorkflowRuntimeContext = createContext<WorkflowRuntime | null>(null);

export function useWorkflowRuntime(): WorkflowRuntime {
  const runtime = useContext(WorkflowRuntimeContext);
  if (!runtime) throw new Error("useWorkflowRuntime doit être utilisé dans WorkflowEditor.");
  return runtime;
}

/** Couleurs (variables de tokens.css) : liens et mini-carte. */
export const PORT_COLORS: Record<PortType, string> = {
  image: "var(--blue)",
  video: "var(--gold-strong)",
  text: "var(--success-text)",
  media: "var(--gold)",
};

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  sources: "var(--gold)",
  text: "var(--orange)",
  kling: "var(--violet)",
  processing: "var(--blue)",
  output: "var(--success)",
};

/** Clés React Query des workflows enregistrés. */
export const workflowKeys = {
  all: ["workflows"] as const,
  list: () => ["workflows", "list"] as const,
};

/** Type MIME du glisser-déposer depuis la palette. */
export const DND_NODE_TYPE = "application/x-goldfx-workflow-node";
