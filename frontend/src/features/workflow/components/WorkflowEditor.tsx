/**
 * Onglet Workflow : éditeur de graphes à nœuds façon ComfyUI (React Flow).
 * Le conteneur parent doit avoir une hauteur définie : l'éditeur occupe 100 %.
 */
import "@xyflow/react/dist/style.css";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type XYPosition,
} from "@xyflow/react";
import clsx from "clsx";
import { LayoutTemplate, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { errorMessage, type Workflow, type WorkflowSummary } from "@/shared/api/client";
import { saveBlob } from "@/shared/lib/download";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import type { WorkflowHost } from "../host";
import { flowToGraph, FLOW_NODE_TYPE, type WorkflowFlowNode } from "../model/flow";
import {
  nameFromFileName,
  normalizeWorkflowName,
  parseWorkflowGraph,
  workflowFileName,
  type WorkflowGraph,
} from "../model/graph";
import { NODE_REGISTRY } from "../nodes/registry";
import { defaultWorkflowServices, type WorkflowServices } from "../services";
import { edgePortType, NODE_WIDTH } from "../state/graphOps";
import { isDirty, useWorkflowStore, workflowStore, type EditorFeedback } from "../state/store";
import { instantiateTemplate, TEMPLATES, type WorkflowTemplate } from "../templates/templates";
import { NodePalette } from "./NodePalette";
import { OpenDialog } from "./OpenDialog";
import { PortLegend } from "./PortLegend";
import {
  CATEGORY_COLORS,
  DND_NODE_TYPE,
  PORT_COLORS,
  WorkflowRuntimeContext,
  workflowKeys,
  type WorkflowRuntime,
} from "./runtime";
import { SaveDialog } from "./SaveDialog";
import { TemplatesDialog } from "./TemplatesDialog";
import { Toolbar } from "./Toolbar";
import styles from "./WorkflowEditor.module.css";
import { WorkflowNode } from "./WorkflowNode";

export interface WorkflowEditorProps {
  /** Atelier hôte (média ouvert, annotations, export) ; facultatif. */
  host?: WorkflowHost | null;
  className?: string;
  /** API injectée (tests) ; par défaut l'API HTTP de l'application. */
  services?: WorkflowServices;
}

const NODE_TYPES = { [FLOW_NODE_TYPE]: WorkflowNode };
const DELETE_KEYS = ["Delete", "Backspace"];

const ARIA_LABELS = {
  "node.a11yDescription.default":
    "Appuyez sur Entrée ou Espace pour sélectionner un nœud, puis sur Suppr pour le retirer ou Échap pour annuler.",
  "node.a11yDescription.keyboardDisabled":
    "Appuyez sur Entrée ou Espace pour sélectionner un nœud, puis utilisez les flèches pour le déplacer. Suppr le retire, Échap annule.",
  "node.a11yDescription.ariaLiveMessage": ({ x, y }: { direction: string; x: number; y: number }) =>
    `Nœud déplacé. Nouvelle position : x ${x}, y ${y}`,
  "edge.a11yDescription.default":
    "Appuyez sur Entrée ou Espace pour sélectionner un lien, puis sur Suppr pour le retirer ou Échap pour annuler.",
  "controls.ariaLabel": "Contrôles du canevas",
  "controls.zoomIn.ariaLabel": "Zoom avant",
  "controls.zoomOut.ariaLabel": "Zoom arrière",
  "controls.fitView.ariaLabel": "Ajuster la vue",
  "controls.interactive.ariaLabel": "Verrouiller ou déverrouiller le canevas",
  "minimap.ariaLabel": "Mini-carte",
  "handle.ariaLabel": "Port",
};

type DialogKind = "open" | "save" | "saveAs" | "templates" | null;

interface SaveRequest {
  id: string | null;
  name: string;
  graph: WorkflowGraph;
  signature: string;
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  host = null,
  className,
  services = defaultWorkflowServices,
}: WorkflowEditorProps) {
  const registry = NODE_REGISTRY;
  const runtime = useMemo<WorkflowRuntime>(
    () => ({ host, services, registry }),
    [host, services, registry],
  );
  const queryClient = useQueryClient();
  const { screenToFlowPosition, fitView } = useReactFlow<WorkflowFlowNode, Edge>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const runStates = useWorkflowStore((s) => s.runStates);
  const running = useWorkflowStore((s) => s.running);
  const name = useWorkflowStore((s) => s.name);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const feedback = useWorkflowStore((s) => s.feedback);
  const dirty = useWorkflowStore(isDirty);
  const {
    onNodesChange,
    onEdgesChange,
    isValidConnection,
    connect,
    addNode,
    load,
    reset,
    markSaved,
    detach,
    setFeedback,
    run,
    stop,
  } = workflowStore.getState();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);

  const selectedNodes = nodes.filter((node) => node.selected);
  const styledEdges = useMemo(
    () =>
      edges.map((edge) => {
        const type = edgePortType(registry, nodes, edge);
        return {
          ...edge,
          animated: runStates[edge.target]?.status === "running",
          style: {
            stroke: type ? PORT_COLORS[type] : undefined,
            strokeWidth: edge.selected ? 3.5 : 2,
          },
        };
      }),
    [edges, nodes, runStates, registry],
  );

  // --- Remplacement du graphe (confirmation si modifications) -------------
  const guardReplace = (action: () => void) => {
    if (isDirty(workflowStore.getState())) setPendingReplace(() => action);
    else action();
  };

  const loadGraph = (graph: WorkflowGraph, meta: { id: string | null; name: string }) => {
    load(graph, meta);
    void fitView({ padding: 0.2, maxZoom: 1 });
  };

  // --- Ajout de nœuds -----------------------------------------------------
  const addNodeAt = (type: string, position: XYPosition) => {
    if (!addNode(type, position, host))
      setFeedback({ tone: "error", title: `Type de nœud inconnu : ${type}` });
  };

  const addAtCenter = (type: string) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    addNodeAt(type, { x: center.x - NODE_WIDTH / 2, y: center.y - 80 });
  };

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DND_NODE_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const onDrop = (event: DragEvent) => {
    const type = event.dataTransfer.getData(DND_NODE_TYPE);
    if (!type) return;
    event.preventDefault();
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNodeAt(type, { x: point.x - NODE_WIDTH / 2, y: point.y - 20 });
  };

  // --- Enregistrement -----------------------------------------------------
  const save = useMutation({
    mutationFn: ({ id, name: workflowName, graph }: SaveRequest): Promise<Workflow> => {
      const payload = { name: workflowName, graph: { ...graph } };
      return id ? services.workflows.update(id, payload) : services.workflows.create(payload);
    },
    onSuccess: (workflow, request) => {
      markSaved(workflow.id, workflow.name, request.signature);
      setDialog(null);
      setFeedback({ tone: "success", title: `Workflow « ${workflow.name} » enregistré.` });
      return queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
    onError: (error, request) => {
      if (request.id && dialog === null)
        setFeedback({
          tone: "error",
          title: "Enregistrement impossible.",
          details: [errorMessage(error)],
        });
    },
  });

  const startSave = (id: string | null, workflowName: string) => {
    const state = workflowStore.getState();
    const graph = flowToGraph(state.nodes, state.edges);
    const parsed = parseWorkflowGraph(graph);
    if (!parsed.ok) {
      setFeedback({ tone: "error", title: "Enregistrement impossible.", details: [parsed.error] });
      return;
    }
    save.mutate({
      id,
      name: normalizeWorkflowName(workflowName),
      graph: parsed.graph,
      signature: JSON.stringify(graph),
    });
  };

  const openSaveDialog = (kind: "save" | "saveAs") => {
    save.reset();
    setDialog(kind);
  };

  // --- Ouverture / suppression --------------------------------------------
  const openWorkflow = async (summary: WorkflowSummary) => {
    try {
      const workflow = await services.workflows.get(summary.id);
      const parsed = parseWorkflowGraph(workflow.graph);
      if (!parsed.ok) throw new Error(parsed.error);
      loadGraph(parsed.graph, { id: workflow.id, name: workflow.name });
      setFeedback({ tone: "success", title: `Workflow « ${workflow.name} » ouvert.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Impossible d'ouvrir le workflow.",
        details: [errorMessage(error)],
      });
    }
  };

  const onDeleted = (id: string) => {
    if (id !== workflowStore.getState().workflowId) return;
    detach();
    setFeedback({
      tone: "info",
      title: "Le workflow ouvert a été supprimé du serveur ; il reste modifiable ici.",
    });
  };

  // --- Import / export JSON -----------------------------------------------
  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setFeedback({
        tone: "error",
        title: "Import impossible : le fichier n'est pas un JSON valide.",
      });
      return;
    }
    const parsed = parseWorkflowGraph(raw);
    if (!parsed.ok) {
      setFeedback({ tone: "error", title: "Import impossible.", details: [parsed.error] });
      return;
    }
    const unknown = [
      ...new Set(parsed.graph.nodes.map((n) => n.type).filter((t) => !registry.get(t))),
    ];
    guardReplace(() => {
      loadGraph(parsed.graph, { id: null, name: nameFromFileName(file.name) });
      const count = parsed.graph.nodes.length;
      const notice: EditorFeedback = {
        tone: unknown.length > 0 ? "info" : "success",
        title: `Workflow importé : ${count} nœud${count > 1 ? "s" : ""}.`,
      };
      if (unknown.length > 0) notice.details = [`Types de nœuds inconnus : ${unknown.join(", ")}.`];
      setFeedback(notice);
    });
  };

  const exportJson = () => {
    const state = workflowStore.getState();
    const graph = flowToGraph(state.nodes, state.edges);
    saveBlob(
      new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" }),
      workflowFileName(state.name),
    );
  };

  // --- Modèles --------------------------------------------------------------
  const applyTemplate = (template: WorkflowTemplate) => {
    setDialog(null);
    guardReplace(() => {
      loadGraph(instantiateTemplate(template), { id: null, name: template.name });
      setFeedback({
        tone: "info",
        title: `Modèle « ${template.name} » chargé : complétez les paramètres puis exécutez.`,
      });
    });
  };

  // --- Exécution ------------------------------------------------------------
  const execute = async (targetNodeId?: string) => {
    const result = await run({ host, api: services, targetNodeId });
    if (result && result.executed.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["media", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["generations", "list"] });
    }
  };

  const onlySelected = selectedNodes.length === 1 ? selectedNodes[0] : undefined;

  return (
    <WorkflowRuntimeContext.Provider value={runtime}>
      <section className={clsx(styles.root, className)} aria-label="Éditeur de workflow">
        <Toolbar
          name={name}
          dirty={dirty}
          running={running}
          saving={save.isPending}
          canRunToSelection={Boolean(onlySelected)}
          onNew={() => guardReplace(reset)}
          onOpen={() => setDialog("open")}
          onSave={() => (workflowId ? startSave(workflowId, name) : openSaveDialog("save"))}
          onSaveAs={() => openSaveDialog("saveAs")}
          onImport={() => fileRef.current?.click()}
          onExport={exportJson}
          onTemplates={() => setDialog("templates")}
          onRun={() => void execute()}
          onRunToSelection={() => onlySelected && void execute(onlySelected.id)}
          onStop={stop}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Fichier de workflow à importer"
          onChange={(event) => void onFileChosen(event)}
        />

        {feedback && (
          <div className={styles.feedback}>
            <StatusMessage tone={feedback.tone}>
              <strong>{feedback.title}</strong>
              {feedback.details && feedback.details.length > 0 && (
                <ul className={styles.details}>
                  {feedback.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
            </StatusMessage>
            {feedback.tone !== "loading" && (
              <button
                type="button"
                className={styles.dismiss}
                aria-label="Fermer le message"
                onClick={() => setFeedback(null)}
              >
                <X aria-hidden />
              </button>
            )}
          </div>
        )}

        <div className={styles.main}>
          <NodePalette registry={registry} onAdd={addAtCenter} />
          <div ref={canvasRef} className={styles.canvas} onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow<WorkflowFlowNode, Edge>
              nodes={nodes}
              edges={styledEdges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection: Connection) => void connect(connection)}
              isValidConnection={isValidConnection}
              nodesConnectable={!running}
              deleteKeyCode={running ? null : DELETE_KEYS}
              colorMode="dark"
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={2}
              ariaLabelConfig={ARIA_LABELS}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => {
                  const category = registry.get((node as WorkflowFlowNode).data.nodeType)?.category;
                  return category ? CATEGORY_COLORS[category] : "var(--danger)";
                }}
              />
              <Panel position="top-right">
                <PortLegend />
              </Panel>
            </ReactFlow>
            {nodes.length === 0 && (
              <div className={styles.empty}>
                <p>Ajoutez des nœuds depuis la palette, ou partez d'un modèle.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<LayoutTemplate aria-hidden />}
                  onClick={() => setDialog("templates")}
                >
                  Voir les modèles
                </Button>
              </div>
            )}
          </div>
        </div>

        <OpenDialog
          open={dialog === "open"}
          services={services}
          currentId={workflowId}
          onOpen={(summary) => {
            setDialog(null);
            guardReplace(() => void openWorkflow(summary));
          }}
          onDeleted={onDeleted}
          onClose={() => setDialog(null)}
        />
        <SaveDialog
          open={dialog === "save" || dialog === "saveAs"}
          title={dialog === "saveAs" ? "Enregistrer sous" : "Enregistrer le workflow"}
          initialName={name}
          pending={save.isPending}
          error={save.isError ? errorMessage(save.error) : null}
          onSubmit={(workflowName) =>
            startSave(dialog === "save" ? workflowId : null, workflowName)
          }
          onClose={() => setDialog(null)}
        />
        <TemplatesDialog
          open={dialog === "templates"}
          templates={TEMPLATES}
          onPick={applyTemplate}
          onClose={() => setDialog(null)}
        />
        <ConfirmDialog
          open={pendingReplace !== null}
          title="Remplacer le workflow en cours ?"
          confirmLabel="Remplacer"
          danger
          onConfirm={() => {
            const action = pendingReplace;
            setPendingReplace(null);
            action?.();
          }}
          onCancel={() => setPendingReplace(null)}
        >
          <p className={styles.confirmText}>Les modifications non enregistrées seront perdues.</p>
        </ConfirmDialog>
      </section>
    </WorkflowRuntimeContext.Provider>
  );
}
