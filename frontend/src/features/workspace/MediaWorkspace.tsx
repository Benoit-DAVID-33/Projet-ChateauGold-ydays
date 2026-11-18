import clsx from "clsx";
import { LayoutPanelLeft, Workflow } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Atelier, outputKey, type AtelierOutput } from "@/features/atelier";
import { useEditorStore, type MediaEditorHandle } from "@/features/editor";
import { mediaRoute, useDeleteMedia } from "@/features/media/hooks";
import { SearchBar } from "@/features/search/SearchBar";
import type { WorkflowHost } from "@/features/workflow/host";
import type { Media, MediaKind } from "@/shared/api/client";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { FullPageSpinner } from "@/shared/ui/FullPageSpinner";

import styles from "./MediaWorkspace.module.css";
import { useMediaOperations } from "./useMediaOperations";

// L'éditeur de graphe (React Flow) n'est chargé qu'à la première ouverture de l'onglet.
const WorkflowEditor = lazy(() =>
  import("@/features/workflow").then((m) => ({ default: m.WorkflowEditor })),
);

type WorkspaceTab = "atelier" | "workflow";

const TABS: { id: WorkspaceTab; label: string; icon: typeof Workflow }[] = [
  { id: "atelier", label: "Atelier", icon: LayoutPanelLeft },
  { id: "workflow", label: "Workflow", icon: Workflow },
];

interface Props {
  /** Média ouvert, ou null (zone de dépôt et générations à partir du texte). */
  media: Media | null;
  pageKind: MediaKind;
}

/**
 * Espace de travail des pages Vidéo et Image : barre « Comment puis-je vous aider ? »,
 * onglets Atelier (trois colonnes) et Workflow (graphe de nœuds). Les deux onglets
 * restent montés une fois ouverts : annotations, sorties et graphe sont conservés
 * quand on passe de l'un à l'autre.
 */
export function MediaWorkspace({ media, pageKind }: Props) {
  const navigate = useNavigate();
  const editor = useRef<MediaEditorHandle>(null);
  const [tab, setTab] = useState<WorkspaceTab>("atelier");
  const [workflowOpened, setWorkflowOpened] = useState(false);
  const [outputs, setOutputs] = useState<AtelierOutput[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteMedia();

  const addOutput = useCallback((output: AtelierOutput) => {
    setOutputs((list) => [output, ...list.filter((o) => outputKey(o) !== outputKey(output))]);
  }, []);
  const operations = useMediaOperations(media, editor, (result, label) =>
    addOutput({ type: "media", media: result, label }),
  );

  // Hôte du Workflow : annotations et export de l'image annotée de l'Atelier.
  const elements = useEditorStore((s) => s.elements);
  const mediaInfo = useEditorStore((s) => s.mediaInfo);
  const exportRef = useRef(operations.saveAnnotatedImage);
  useEffect(() => {
    exportRef.current = operations.saveAnnotatedImage;
  });
  const exportAnnotatedImage = useCallback(() => exportRef.current(), []);
  const host = useMemo<WorkflowHost>(
    () => ({
      media,
      elements: media ? elements : [],
      mediaInfo: media ? mediaInfo : null,
      exportAnnotatedImage,
    }),
    [media, elements, mediaInfo, exportAnnotatedImage],
  );

  const select = (next: WorkspaceTab) => {
    setTab(next);
    if (next === "workflow") setWorkflowOpened(true);
  };

  const noun = media?.kind === "video" ? "vidéo" : "image";

  return (
    <div className={styles.workspace}>
      <SearchBar
        onSubmit={(query) =>
          media
            ? operations.sendToApi(query)
            : query && navigate(`/search?q=${encodeURIComponent(query)}`)
        }
        onSearch={(query) => navigate(`/search?q=${encodeURIComponent(query)}`)}
        pending={operations.busy}
      />

      <div className={styles.tabs} role="tablist" aria-label="Espace de travail">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`workspace-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`workspace-panel-${id}`}
            className={clsx(styles.tab, tab === id && styles.tabActive)}
            onClick={() => select(id)}
          >
            <Icon aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div
        id="workspace-panel-atelier"
        role="tabpanel"
        aria-labelledby="workspace-tab-atelier"
        hidden={tab !== "atelier"}
      >
        <Atelier
          media={media}
          pageKind={pageKind}
          editorRef={editor}
          operations={operations}
          outputs={outputs}
          onOutput={addOutput}
          onUploaded={(uploaded) => navigate(mediaRoute(uploaded))}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>

      {workflowOpened && (
        <div
          id="workspace-panel-workflow"
          role="tabpanel"
          aria-labelledby="workspace-tab-workflow"
          hidden={tab !== "workflow"}
          className={styles.workflow}
        >
          <Suspense fallback={<FullPageSpinner />}>
            <WorkflowEditor host={host} />
          </Suspense>
        </div>
      )}

      {media && (
        <ConfirmDialog
          open={confirmDelete}
          title={media.kind === "video" ? "Supprimer la vidéo" : "Supprimer l'image"}
          danger
          confirmLabel="Supprimer"
          pending={remove.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            remove.mutate(media.id, {
              onSuccess: () => navigate(`/${media.kind}`, { replace: true }),
            })
          }
        >
          Êtes-vous sûr de vouloir supprimer cette {noun} ? Les résultats dérivés sont conservés
          dans la bibliothèque.
        </ConfirmDialog>
      )}
    </div>
  );
}
