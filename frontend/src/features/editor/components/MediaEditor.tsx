import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type SyntheticEvent,
} from "react";

import { StatusMessage } from "@/shared/ui/StatusMessage";

import type { RecordVideoOptions } from "../export/recordVideo";
import { recordAnnotatedVideo } from "../export/recordVideo";
import { exportAnnotatedImage } from "../export/exportImage";
import { unitsPerPx, visibleCenter, type ViewMetrics } from "../interaction/coords";
import { toolCursor } from "../interaction/gestures";
import { useKeyboardShortcuts } from "../interaction/useKeyboardShortcuts";
import { usePointerInteraction } from "../interaction/usePointerInteraction";
import { useSeekRequests } from "../interaction/useSeekRequests";
import { useVideoTimeSync } from "../interaction/useVideoTimeSync";
import { useWheelControls } from "../interaction/useWheelControls";
import { useZoom } from "../interaction/useZoom";
import type { AnnotationElement, MediaInfo, Point } from "../model/types";
import { measureText } from "../render/measure";
import { useEditorStore } from "../store/editorStore";
import { selectIsToolActive } from "../store/selectors";
import { ContextMenu } from "./ContextMenu";
import { EditActions } from "./EditActions";
import { useFitSize } from "./hooks/useFitSize";
import { useOverlayRenderer } from "./hooks/useOverlayRenderer";
import styles from "./MediaEditor.module.css";
import { ToolStatus } from "./ToolStatus";
import { ZoomControls } from "./ZoomControls";

export interface EditorMedia {
  id: string;
  kind: "image" | "video";
  name: string;
  content_url: string;
}

export interface MediaEditorHandle {
  /** PNG à la résolution native : média (frame courante) + annotations, sans poignées. */
  exportImage(): Promise<Blob>;
  /** WebM de la vidéo entière avec les annotations incrustées (vidéo uniquement). */
  recordVideo(options?: RecordVideoOptions): Promise<Blob>;
  getElements(): AnnotationElement[];
  getMediaInfo(): MediaInfo | null;
}

export interface MediaEditorProps {
  media: EditorMedia;
  className?: string;
  ref?: Ref<MediaEditorHandle>;
}

interface SurfaceApi {
  exportImage(): Promise<Blob>;
  recordVideo(options?: RecordVideoOptions): Promise<Blob>;
}

const NOTICE_DURATION_MS = 4000;

/**
 * Éditeur d'annotations d'un média (image ou vidéo) : média, calque
 * d'annotations, zoom, menu contextuel. Un changement de média remonte la
 * surface (clé) : zoom et état local repartent de zéro, le store est réinitialisé.
 */
export function MediaEditor({ media, className, ref }: MediaEditorProps) {
  const surface = useRef<SurfaceApi>(null);
  useImperativeHandle(
    ref,
    () => ({
      exportImage: () =>
        surface.current?.exportImage() ?? Promise.reject(new Error("Éditeur non prêt.")),
      recordVideo: (options) =>
        surface.current?.recordVideo(options) ?? Promise.reject(new Error("Éditeur non prêt.")),
      getElements: () => useEditorStore.getState().elements,
      getMediaInfo: () => useEditorStore.getState().mediaInfo,
    }),
    [],
  );
  return (
    <EditorSurface
      key={`${media.id}\u0000${media.content_url}`}
      ref={surface}
      media={media}
      className={className}
    />
  );
}

function readMediaInfo(el: HTMLImageElement | HTMLVideoElement, name: string): MediaInfo | null {
  if (el instanceof HTMLVideoElement) {
    if (!el.videoWidth || !el.videoHeight) return null;
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
    return {
      kind: "video",
      name,
      width: el.videoWidth,
      height: el.videoHeight,
      ...(duration === undefined ? {} : { duration }),
    };
  }
  const width = el.naturalWidth || el.width;
  const height = el.naturalHeight || el.height;
  return width && height ? { kind: "image", name, width, height } : null;
}

interface SurfaceProps {
  media: EditorMedia;
  className?: string;
  ref: Ref<SurfaceApi>;
}

function EditorSurface({ media, className, ref }: SurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hintId = useId();
  const isVideo = media.kind === "video";

  const info = useEditorStore((s) => s.mediaInfo);
  const tool = useEditorStore((s) => s.tool);
  const rotateArmed = useEditorStore((s) => s.rotateArmed);
  const toolActive = useEditorStore(selectIsToolActive);
  const selectedId = useEditorStore((s) => s.selectedId);
  const notice = useEditorStore((s) => s.notice);
  const [menu, setMenu] = useState<{ position: Point; id: string } | null>(null);

  // Nouveau média : document vierge. Avant tout événement load/loadedmetadata.
  useLayoutEffect(() => {
    useEditorStore.getState().reset(media.kind);
  }, [media.kind]);

  const getMetrics = useCallback((): ViewMetrics | null => {
    const canvas = canvasRef.current;
    const current = useEditorStore.getState().mediaInfo;
    if (!canvas || !current) return null;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { rect, info: current } : null;
  }, []);

  // Les outils créent les éléments au centre de la partie visible, à l'échelle écran.
  useEffect(() => {
    const store = useEditorStore.getState();
    store.setPlacementProvider(() => {
      const metrics = getMetrics();
      if (!metrics) return null;
      const viewport = viewportRef.current?.getBoundingClientRect() ?? null;
      return { center: visibleCenter(metrics, viewport), unitsPerPx: unitsPerPx(metrics) };
    });
    return () => store.setPlacementProvider(null);
  }, [getMetrics]);

  // Bandeau d'information non bloquant (remplace les alert() d'origine).
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => useEditorStore.getState().dismissNotice(notice.id),
      NOTICE_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [notice]);

  const { zoom, zoomBy, resetZoom } = useZoom(viewportRef, getMetrics);
  const fit = useFitSize(rootRef, viewportRef, probeRef, info);

  const openMenu = useCallback((position: Point) => {
    const id = useEditorStore.getState().selectedId;
    if (id) setMenu({ position, id });
  }, []);
  const closeMenu = useCallback(() => {
    setMenu(null);
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  /** Réinitialisation de zoom.js : zoom 100 % et, pour une vidéo, retour au début + lecture. */
  const resetView = useCallback(() => {
    resetZoom();
    const video = videoRef.current;
    if (isVideo && video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }, [isVideo, resetZoom]);

  const pointer = usePointerInteraction({
    focusRef: viewportRef,
    getMetrics,
    measure: measureText,
    onContextMenu: openMenu,
    onBackgroundDoubleClick: resetZoom,
  });
  useWheelControls({ viewportRef, stageRef, getMetrics, measure: measureText, onZoomStep: zoomBy });
  useKeyboardShortcuts({ rootRef, getMetrics, measure: measureText, onOpenContextMenu: openMenu });
  useOverlayRenderer(canvasRef, info, measureText);
  useVideoTimeSync(videoRef, isVideo);
  useSeekRequests(videoRef, isVideo);

  useImperativeHandle(
    ref,
    () => ({
      exportImage: () => {
        const el = isVideo ? videoRef.current : imageRef.current;
        if (!el) return Promise.reject(new Error("Média non disponible."));
        return exportAnnotatedImage({
          media: el,
          elements: useEditorStore.getState().elements,
          time: el instanceof HTMLVideoElement ? el.currentTime : 0,
          measure: measureText,
        });
      },
      recordVideo: (options) => {
        const video = videoRef.current;
        if (!isVideo || !video) {
          return Promise.reject(new Error("L'enregistrement n'est disponible que pour une vidéo."));
        }
        const scene = () => ({
          elements: useEditorStore.getState().elements,
          measure: measureText,
        });
        return recordAnnotatedVideo(video, scene, options);
      },
    }),
    [isVideo],
  );

  const onMediaReady = (e: SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
    const next = readMediaInfo(e.currentTarget, media.name);
    if (next) useEditorStore.getState().setMediaInfo(next);
  };
  const onMediaError = () =>
    useEditorStore
      .getState()
      .notify(
        "error",
        isVideo ? "Impossible de charger la vidéo." : "Impossible de charger l'image.",
      );

  const capturing = toolActive || pointer.capturing;
  const cursor = toolCursor(tool, rotateArmed) ?? pointer.hoverCursor;
  const stageSize = fit ? { width: fit.width * zoom, height: fit.height * zoom } : undefined;

  return (
    <div ref={rootRef} className={clsx(styles.root, className)} data-media-kind={media.kind}>
      <div ref={probeRef} className={styles.probe} aria-hidden="true" />

      <div className={styles.toolbar}>
        <div className={styles.toolbarStart}>
          <ToolStatus />
        </div>
        <EditActions onOpenActions={openMenu} />
        <ZoomControls
          zoom={zoom}
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onReset={resetView}
        />
      </div>

      <div
        ref={viewportRef}
        className={styles.viewport}
        tabIndex={0}
        role="group"
        aria-roledescription="éditeur d'annotations"
        aria-label={`Édition : ${media.name}`}
        aria-describedby={hintId}
      >
        <div
          ref={stageRef}
          className={clsx(
            styles.stage,
            !stageSize && styles.pending,
            (toolActive || selectedId !== null) && styles.locked,
          )}
          style={stageSize}
          {...pointer.handlers}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              className={styles.media}
              src={media.content_url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={onMediaReady}
              onDurationChange={onMediaReady}
              onError={onMediaError}
            >
              Votre navigateur ne supporte pas la vidéo HTML5.
            </video>
          ) : (
            <img
              ref={imageRef}
              className={styles.media}
              src={media.content_url}
              alt={media.name}
              draggable={false}
              onLoad={onMediaReady}
              onError={onMediaError}
            />
          )}
          <canvas
            ref={canvasRef}
            className={clsx(styles.overlay, capturing && styles.capturing)}
            style={{ cursor }}
            data-testid="annotation-layer"
            aria-hidden="true"
          />
        </div>
      </div>

      {notice && (
        <StatusMessage tone={notice.tone}>
          <span>{notice.text}</span>
        </StatusMessage>
      )}

      <p id={hintId} className="visually-hidden">
        Sélectionnez un élément pour le déplacer ou le redimensionner. Raccourcis : Suppr pour
        supprimer, Échap pour quitter l'outil ou désélectionner, Ctrl+Z pour annuler, Ctrl+Maj+Z
        pour rétablir, flèches pour déplacer, Maj+F10 pour le menu de l'élément, Ctrl+molette pour
        zoomer.
      </p>

      {menu && menu.id === selectedId && (
        <ContextMenu
          position={menu.position}
          elementId={menu.id}
          showMotionTracking={isVideo}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
