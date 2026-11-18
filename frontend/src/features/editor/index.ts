/**
 * API publique de l'éditeur d'annotations (images et vidéos).
 * Contrat des données : ./model/types.ts (coordonnées en pixels natifs).
 */
export { MediaEditor } from "./components/MediaEditor";
export type { MediaEditorProps, MediaEditorHandle } from "./components/MediaEditor";
export { useEditorStore } from "./store/editorStore";
export { ToolsMenu } from "./components/ToolsMenu";

// Composants « Atelier » en ligne (mise en page type SD WebUI).
export { ToolsSidebar } from "./components/ToolsSidebar";
export type { ToolsSidebarProps } from "./components/ToolsSidebar";
export { LayersPanel } from "./components/LayersPanel";
export type { LayersPanelProps } from "./components/LayersPanel";
export { TimelinePanel } from "./components/TimelinePanel";
export type { TimelinePanelProps } from "./components/TimelinePanel";
