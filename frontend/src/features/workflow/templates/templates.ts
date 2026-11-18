/** Modèles de workflows prêts à l'emploi (chacun est un graphe valide). */
import { edgeId } from "../model/flow";
import {
  GRAPH_VERSION,
  type GraphEdge,
  type GraphNode,
  type NodeData,
  type WorkflowGraph,
} from "../model/graph";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  graph: WorkflowGraph;
}

const COLUMN = 340;

function node(
  id: string,
  type: string,
  column: number,
  row: number,
  data: NodeData = {},
): GraphNode {
  return { id, type, position: { x: column * COLUMN, y: row * 220 }, data };
}

function link(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): GraphEdge {
  return {
    id: edgeId(source, sourceHandle, target, targetHandle),
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

function graph(nodes: GraphNode[], edges: GraphEdge[]): WorkflowGraph {
  return { version: GRAPH_VERSION, nodes, edges };
}

export const TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: "text-image-video",
    name: "Texte vers image puis vidéo",
    description: "Un prompt génère une image avec Kling, puis cette image est animée en vidéo.",
    graph: graph(
      [
        node("prompt", "text", 0, 0, {
          text: "Un phare sur une falaise au coucher du soleil, lumière dorée, style cinématographique",
        }),
        node("image", "kling-text-to-image", 1, 0, {
          aspectRatio: "16:9",
          count: 1,
          negativePrompt: "",
        }),
        node("video", "kling-image-to-video", 2, 0, { duration: "5", mode: "std" }),
        node("output", "output", 3, 0),
      ],
      [
        link("prompt", "text", "image", "prompt"),
        link("image", "image", "video", "image"),
        link("video", "video", "output", "media"),
      ],
    ),
  },
  {
    id: "transform-atelier-video",
    name: "Transformer la vidéo de l'Atelier",
    description:
      "L'Assistant IA décrit vos annotations, puis Omni-Video transforme la vidéo ouverte dans l'Atelier.",
    graph: graph(
      [
        node("source", "atelier-media", 0, 0, { kind: "video" }),
        node("intent", "text", 0, 1, {
          text: "Transforme cette scène en film noir et blanc des années 1950",
        }),
        node("assistant", "assistant", 1, 1),
        node("omni", "kling-omni-video", 2, 0, {
          usage: "base",
          aspectRatio: "16:9",
          duration: "5",
        }),
        node("output", "output", 3, 0),
      ],
      [
        link("intent", "text", "assistant", "intent"),
        link("source", "media", "omni", "video"),
        link("assistant", "prompt", "omni", "prompt"),
        link("omni", "video", "output", "media"),
      ],
    ),
  },
  {
    id: "animate-annotated-image",
    name: "Animer l'image annotée",
    description: "L'image annotée de l'Atelier est enregistrée puis animée avec Kling.",
    graph: graph(
      [
        node("annotated", "annotated-image", 0, 0),
        node("motion", "text", 0, 1, {
          text: "Mouvement de caméra lent vers l'avant, ambiance douce",
        }),
        node("video", "kling-image-to-video", 1, 0, { duration: "5", mode: "std" }),
        node("output", "output", 2, 0),
      ],
      [
        link("annotated", "image", "video", "image"),
        link("motion", "text", "video", "prompt"),
        link("video", "video", "output", "media"),
      ],
    ),
  },
  {
    id: "processing-api",
    name: "Traitement par l'API",
    description: "Un média de la bibliothèque et une consigne sont envoyés à l'API de traitement.",
    graph: graph(
      [
        node("source", "library-media", 0, 0, { mediaId: null, mediaKind: "image", mediaName: "" }),
        node("query", "text", 0, 1, { text: "Améliore la netteté et les couleurs" }),
        node("process", "processing-api", 1, 0),
        node("output", "output", 2, 0),
      ],
      [
        link("source", "media", "process", "media"),
        link("query", "text", "process", "query"),
        link("process", "media", "output", "media"),
      ],
    ),
  },
];

/** Copie profonde d'un modèle (le graphe chargé peut être modifié librement). */
export function instantiateTemplate(template: WorkflowTemplate): WorkflowGraph {
  return structuredClone(template.graph);
}
