/**
 * Rendu d'un nœud façon ComfyUI : barre de titre colorée par catégorie, ports
 * typés (entrées à gauche, sorties à droite), paramètres, état d'exécution,
 * progression, message et aperçu du résultat.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import { memo, useCallback } from "react";

import { mediaRoute } from "@/features/media/hooks";

import { resolveData, type NodeRunState, type NodeStatus } from "../engine/types";
import type { WorkflowFlowNode } from "../model/flow";
import type { NodeData } from "../model/graph";
import { PORT_TYPE_LABELS, type Port } from "../model/ports";
import type { WorkflowValue } from "../model/values";
import { useWorkflowStore } from "../state/store";
import { portsOf } from "../state/graphOps";
import { useWorkflowRuntime } from "./runtime";
import styles from "./WorkflowNode.module.css";

const STATUS: Record<Exclude<NodeStatus, "idle">, { label: string; icon: typeof Clock }> = {
  queued: { label: "En attente", icon: Clock },
  running: { label: "En cours", icon: LoaderCircle },
  done: { label: "Terminé", icon: CircleCheck },
  error: { label: "Erreur", icon: CircleAlert },
  skipped: { label: "Ignoré", icon: Ban },
};

function StatusBadge({ status }: { status: NodeStatus }) {
  if (status === "idle") return null;
  const { label, icon: Icon } = STATUS[status];
  return (
    <span className={clsx(styles.badge, styles[`badge-${status}`])}>
      <Icon aria-hidden className={clsx(styles.badgeIcon, status === "running" && styles.spin)} />
      {label}
    </span>
  );
}

function formatDuration(state: NodeRunState): string | null {
  if (state.startedAt === undefined || state.finishedAt === undefined) return null;
  const seconds = Math.max(0, Math.round((state.finishedAt - state.startedAt) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function PortRow({ input, output }: { input?: Port; output?: Port }) {
  return (
    <div className={styles.portRow}>
      <div className={styles.portIn}>
        {input && (
          <>
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              className={clsx(styles.handle, styles[`port-${input.type}`])}
              title={`Entrée ${PORT_TYPE_LABELS[input.type]}`}
              aria-label={`Entrée « ${input.label} » (${PORT_TYPE_LABELS[input.type]})`}
            />
            <span className={styles.portLabel}>
              {input.label}
              {input.optional && <span className={styles.optional}> (facultatif)</span>}
            </span>
          </>
        )}
      </div>
      <div className={styles.portOut}>
        {output && (
          <>
            <span className={styles.portLabel}>{output.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={output.id}
              className={clsx(styles.handle, styles[`port-${output.type}`])}
              title={`Sortie ${PORT_TYPE_LABELS[output.type]}`}
              aria-label={`Sortie « ${output.label} » (${PORT_TYPE_LABELS[output.type]})`}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ValuePreview({ value }: { value: WorkflowValue }) {
  if (value.kind === "text") {
    return (
      <pre className={clsx(styles.textPreview, "nodrag", "nowheel")} aria-label="Texte produit">
        {value.text}
      </pre>
    );
  }
  const { media } = value;
  const isVideo = media.kind === "video";
  return (
    <figure className={styles.preview}>
      {isVideo ? (
        <video
          className={clsx(styles.previewMedia, "nodrag")}
          src={media.content_url}
          controls
          preload="metadata"
          aria-label={`Aperçu de la vidéo ${media.name}`}
        />
      ) : (
        <img
          className={styles.previewMedia}
          src={media.content_url}
          alt={`Aperçu : ${media.name}`}
        />
      )}
      <figcaption className={styles.previewCaption}>
        <span className={styles.previewName}>{media.name}</span>
        <a
          className={clsx(styles.link, "nodrag")}
          href={mediaRoute(media)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {isVideo ? "Ouvrir la vidéo" : "Ouvrir l'image"}
          <ExternalLink aria-hidden className={styles.linkIcon} />
        </a>
      </figcaption>
    </figure>
  );
}

function OtherResults({ ids, kind }: { ids: readonly string[]; kind: "image" | "video" }) {
  if (ids.length < 2) return null;
  return (
    <ul className={styles.results} aria-label="Tous les résultats">
      {ids.map((id, index) => (
        <li key={id}>
          <a
            className={clsx(styles.link, "nodrag")}
            href={mediaRoute({ id, kind })}
            target="_blank"
            rel="noopener noreferrer"
          >
            Résultat {index + 1}
          </a>
        </li>
      ))}
    </ul>
  );
}

function UnknownNode({ type, selected }: { type: string; selected: boolean }) {
  return (
    <div
      className={clsx(styles.node, styles.unknown, selected && styles.selected)}
      role="group"
      aria-label={`Nœud de type inconnu ${type}`}
    >
      <header className={styles.header}>
        <CircleHelp aria-hidden className={styles.icon} />
        <span className={styles.title}>Type inconnu</span>
      </header>
      <p className={clsx(styles.message, styles.messageError)}>
        Le type « {type} » n'existe pas dans cette version : supprimez ce nœud.
      </p>
    </div>
  );
}

function WorkflowNodeComponent({ id, data, selected }: NodeProps<WorkflowFlowNode>) {
  const { registry, host, services } = useWorkflowRuntime();
  const runState = useWorkflowStore((state) => state.runStates[id]);
  const running = useWorkflowStore((state) => state.running);
  const updateParams = useWorkflowStore((state) => state.updateParams);
  const onChange = useCallback(
    (patch: Partial<NodeData>) => updateParams(id, patch),
    [id, updateParams],
  );

  const definition = registry.get(data.nodeType);
  if (!definition) return <UnknownNode type={data.nodeType} selected={Boolean(selected)} />;

  const params = resolveData(definition, data.params);
  const { inputs, outputs } = portsOf(registry, { data });
  const rows = Array.from({ length: Math.max(inputs.length, outputs.length) }, (_, i) => i);
  const status = runState?.status ?? "idle";
  const Icon = definition.icon;
  const Params = definition.Params;
  const duration = runState && status === "done" ? formatDuration(runState) : null;
  const outputKind = outputs[0]?.type;

  return (
    <div
      className={clsx(
        styles.node,
        styles[`cat-${definition.category}`],
        styles[`status-${status}`],
        selected && styles.selected,
      )}
      role="group"
      aria-label={`Nœud ${definition.title}`}
    >
      <header className={styles.header} title={definition.description}>
        <Icon aria-hidden className={styles.icon} />
        <span className={styles.title}>{definition.title}</span>
        <StatusBadge status={status} />
      </header>

      {rows.length > 0 && (
        <div className={styles.ports}>
          {rows.map((i) => (
            <PortRow key={i} input={inputs[i]} output={outputs[i]} />
          ))}
        </div>
      )}

      {Params && (
        <div className={styles.params}>
          <Params
            nodeId={id}
            data={params}
            onChange={onChange}
            host={host}
            api={services}
            disabled={running}
          />
        </div>
      )}

      {status === "running" && (
        <div
          className={clsx(
            styles.progress,
            runState?.progress === undefined && styles.indeterminate,
          )}
          role="progressbar"
          aria-label={`Progression de « ${definition.title} »`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            runState?.progress === undefined ? undefined : Math.round(runState.progress * 100)
          }
        >
          <span
            className={styles.progressBar}
            style={
              runState?.progress === undefined
                ? undefined
                : { width: `${runState.progress * 100}%` }
            }
          />
        </div>
      )}

      {runState?.message && (
        <p
          className={clsx(
            styles.message,
            status === "error" && styles.messageError,
            status === "skipped" && styles.messageMuted,
          )}
        >
          {runState.message}
        </p>
      )}
      {duration && <p className={styles.meta}>Terminé en {duration}</p>}
      {runState?.preview && <ValuePreview value={runState.preview} />}
      {runState?.mediaIds && (outputKind === "image" || outputKind === "video") && (
        <OtherResults ids={runState.mediaIds} kind={outputKind} />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
