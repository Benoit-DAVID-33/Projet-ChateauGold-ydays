import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ChevronDown,
  Download,
  Library,
  PlugZap,
  Send,
  Sparkles,
  Trash2,
  Video,
  Wrench,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode, type RefObject } from "react";

import { PromptComposer, usePromptComposition } from "@/features/assistant";
import {
  LayersPanel,
  MediaEditor,
  TimelinePanel,
  ToolsMenu,
  ToolsSidebar,
  useEditorStore,
  type MediaEditorHandle,
} from "@/features/editor";
import type { AnnotationElement } from "@/features/editor/model/types";
import { useCreateGeneration } from "@/features/generation/hooks";
import { Dropzone } from "@/features/media/Dropzone";
import { formatBytes } from "@/features/media/hooks";
import type { MediaOperations } from "@/features/workspace/useMediaOperations";
import { errorMessage, type Generation, type Media, type MediaKind } from "@/shared/api/client";
import { generationApi } from "@/shared/api/endpoints";
import { Button } from "@/shared/ui/Button";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import {
  buildGenerationInput,
  DEFAULT_PARAMS,
  defaultMode,
  generationBlocker,
  isGenerationMode,
  modeInfo,
  paramsFromGeneration,
  unavailableReason,
  type AtelierMode,
  type GenerationParams,
} from "../model/modes";
import type { AtelierOutput } from "../model/outputs";
import styles from "./Atelier.module.css";
import { GenerationParamsFields } from "./GenerationParamsFields";
import { HistoryPanel } from "./HistoryPanel";
import { ModeTabs } from "./ModeTabs";
import { OutputsPanel } from "./OutputsPanel";

const NO_ELEMENTS: AnnotationElement[] = [];

export interface AtelierProps {
  /** Média ouvert ; null : zone de dépôt et générations à partir du texte uniquement. */
  media: Media | null;
  /** Type de la page (/image ou /video) : mode par défaut sans média. */
  pageKind: MediaKind;
  editorRef: RefObject<MediaEditorHandle | null>;
  operations: MediaOperations;
  outputs: AtelierOutput[];
  onOutput(output: AtelierOutput): void;
  onUploaded(media: Media): void;
  onDelete(): void;
}

/**
 * Atelier d'édition en trois colonnes, inspiré de Stable Diffusion WebUI :
 * - gauche : outils d'annotation, prompt, paramètres et action principale ;
 * - centre : onglets de mode, canevas, calques et timeline ;
 * - droite : sorties de la session et historique.
 * Sous 1100 px, les colonnes s'empilent (centre, puis gauche, puis droite) et les outils
 * passent dans un tiroir ouvert par le bouton « Outils ».
 */
export function Atelier({
  media,
  pageKind,
  editorRef,
  operations,
  outputs,
  onOutput,
  onUploaded,
  onDelete,
}: AtelierProps) {
  const panelId = useId();
  const [mode, setMode] = useState<AtelierMode>(() => defaultMode(media, pageKind));
  const [intent, setIntent] = useState("");
  const [negative, setNegative] = useState("");
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS);
  const [toolsOpen, setToolsOpen] = useState(false);

  const storeElements = useEditorStore((s) => s.elements);
  const storeInfo = useEditorStore((s) => s.mediaInfo);
  const elements = media ? storeElements : NO_ELEMENTS;
  const mediaInfo = media ? storeInfo : null;
  const composition = usePromptComposition({ intent, includeAnnotations, elements, mediaInfo });

  const create = useCreateGeneration();
  const health = useMutation({ mutationFn: generationApi.providerHealth });

  const generate = () => {
    if (!isGenerationMode(mode)) return;
    create.mutate(buildGenerationInput(mode, params, composition.prompt, negative, media), {
      onSuccess: (generation) => onOutput({ type: "generation", id: generation.id }),
    });
  };

  const reuse = (generation: Generation) => {
    if (unavailableReason(generation.kind, media) === null) setMode(generation.kind);
    setIntent(generation.prompt);
    const negativePrompt = generation.parameters.negative_prompt;
    setNegative(typeof negativePrompt === "string" ? negativePrompt : "");
    // Le prompt enregistré contient déjà la description des annotations.
    setIncludeAnnotations(false);
    setParams(paramsFromGeneration(generation.parameters));
  };

  const blocker = isGenerationMode(mode)
    ? generationBlocker(mode, composition.prompt, media, composition.tooLong)
    : null;
  const isVideo = media?.kind === "video";

  return (
    <div className={styles.atelier}>
      <aside className={styles.left} aria-label="Outils, prompt et paramètres">
        {media && <ToolsSidebar className={styles.desktopOnly} />}
        <Panel title="Composition">
          <PromptComposer
            intent={intent}
            onIntentChange={setIntent}
            negativePrompt={negative}
            onNegativePromptChange={setNegative}
            includeAnnotations={includeAnnotations}
            onIncludeAnnotationsChange={setIncludeAnnotations}
            elements={elements}
            mediaInfo={mediaInfo}
          />
        </Panel>
        {isGenerationMode(mode) && (
          <Panel title="Paramètres">
            <GenerationParamsFields kind={mode} params={params} onChange={setParams} />
          </Panel>
        )}

        <div className={styles.actionBar}>
          {isGenerationMode(mode) ? (
            <>
              <Button
                variant="primary"
                size="lg"
                block
                icon={<Sparkles />}
                className={styles.generate}
                disabled={blocker !== null}
                loading={create.isPending}
                onClick={generate}
              >
                Générer
              </Button>
              {blocker && <p className={styles.hint}>{blocker}</p>}
              {create.isError && (
                <StatusMessage tone="error">{errorMessage(create.error)}</StatusMessage>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={<PlugZap />}
                loading={health.isPending}
                onClick={() => health.mutate()}
              >
                Tester la connexion Kling
              </Button>
              {health.data && (
                <StatusMessage tone={health.data.ok ? "success" : "error"}>
                  {health.data.message}
                </StatusMessage>
              )}
              {health.isError && (
                <StatusMessage tone="error">{errorMessage(health.error)}</StatusMessage>
              )}
            </>
          ) : (
            <AnnotateActions
              isVideo={isVideo}
              operations={operations}
              onSend={() => operations.sendToApi(composition.prompt)}
            />
          )}
        </div>
      </aside>

      <section className={styles.center} aria-label="Espace de travail">
        <ModeTabs mode={mode} media={media} onChange={setMode} panelId={panelId} />
        <p className={styles.modeDescription}>{modeInfo(mode).description}</p>
        <div id={panelId} role="tabpanel" aria-label={modeInfo(mode).label}>
          {media ? (
            <div className={styles.canvasArea}>
              <div className={styles.mediaBar}>
                <span className={styles.mediaName} title={media.name}>
                  {media.name}
                </span>
                <span className={styles.mediaMeta}>{formatBytes(media.size_bytes)}</span>
                <Button
                  variant="tools"
                  size="sm"
                  icon={<Wrench />}
                  className={styles.mobileOnly}
                  onClick={() => setToolsOpen(true)}
                >
                  Outils
                </Button>
                <Button variant="danger" size="sm" icon={<Trash2 />} onClick={onDelete}>
                  {isVideo ? "Supprimer la vidéo" : "Supprimer l'image"}
                </Button>
              </div>
              <MediaEditor ref={editorRef} media={media} />
              <EditorBottomPanels isVideo={isVideo} />
              <ToolsMenu open={toolsOpen} onOpenChange={setToolsOpen} />
            </div>
          ) : (
            <Dropzone kind={pageKind} onUploaded={onUploaded} />
          )}
        </div>
      </section>

      <aside className={styles.right} aria-label="Sorties et historique">
        <Panel title="Sorties" badge={outputs.length || undefined}>
          <OutputsPanel outputs={outputs} />
        </Panel>
        <Panel title="Historique">
          <HistoryPanel media={media} pageKind={pageKind} onReuse={reuse} />
        </Panel>
      </aside>
    </div>
  );
}

function AnnotateActions({
  isVideo,
  operations,
  onSend,
}: {
  isVideo: boolean;
  operations: MediaOperations;
  onSend(): void;
}) {
  const { busy, status, recording } = operations;
  return (
    <>
      <Button variant="primary" size="lg" block icon={<Send />} disabled={busy} onClick={onSend}>
        Envoyer à l'API
      </Button>
      {isVideo ? (
        <>
          <Button
            block
            icon={<Video />}
            disabled={busy}
            onClick={() => operations.exportVideo(false)}
          >
            Télécharger la vidéo annotée
          </Button>
          <Button
            block
            icon={<Library />}
            disabled={busy}
            onClick={() => operations.exportVideo(true)}
          >
            Enregistrer dans la bibliothèque
          </Button>
        </>
      ) : (
        <>
          <Button block icon={<Download />} disabled={busy} onClick={operations.downloadImage}>
            Télécharger l'image modifiée
          </Button>
          <Button block icon={<Library />} disabled={busy} onClick={operations.saveImageToLibrary}>
            Enregistrer dans la bibliothèque
          </Button>
        </>
      )}
      {status && <StatusMessage tone={status.tone}>{status.text}</StatusMessage>}
      {recording && (
        <Button variant="outline" size="sm" icon={<X />} onClick={operations.cancelRecording}>
          Annuler l'enregistrement
        </Button>
      )}
    </>
  );
}

/**
 * Sous le canevas : calques, et pour une vidéo la timeline à côté (empilées sur
 * un écran étroit). Chaque panneau porte son propre titre.
 */
function EditorBottomPanels({ isVideo }: { isVideo: boolean }) {
  return (
    <div className={clsx(styles.bottom, isVideo && styles.bottomVideo)}>
      <LayersPanel />
      {isVideo && <TimelinePanel />}
    </div>
  );
}

/** Section repliable d'une colonne (ouverte par défaut). */
function Panel({ title, badge, children }: { title: string; badge?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <details className={styles.panel} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={styles.panelSummary}>
        <span>{title}</span>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
        <ChevronDown className={styles.chevron} aria-hidden />
      </summary>
      <div className={styles.panelBody}>{children}</div>
    </details>
  );
}
