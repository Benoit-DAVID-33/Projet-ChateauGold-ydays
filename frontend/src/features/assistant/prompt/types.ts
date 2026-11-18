/**
 * Types produits par le générateur de prompts de l'Assistant IA.
 *
 * Toutes les sorties (description française, prompt complet anglais, prompt
 * envoyé, export JSON) sont rendues à partir d'une seule analyse
 * (`ElementsAnalysis`) : c'est la source de vérité unique qui garantit leur
 * cohérence.
 */
import type { LineKind, Shape3DKind, ShapeKind, StrokeTool } from "@/features/editor/model/types";

/** Les neuf zones de la grille 3×3 (bornes 33 % / 66 %, libellés d'origine). */
export type Zone =
  | "Haut-Gauche"
  | "Haut-Centre"
  | "Haut-Droite"
  | "Centre-Gauche"
  | "Centre"
  | "Centre-Droite"
  | "Bas-Gauche"
  | "Bas-Centre"
  | "Bas-Droite";

/** Catégorie de taille (moyenne largeur % / hauteur %). */
export type SizeCategory = "Très petit" | "Petit" | "Moyen" | "Grand" | "Très grand";

/** Point en pourcentage du cadre (0 = bord gauche/haut, 100 = bord droit/bas). */
export interface PercentPoint {
  x: number;
  y: number;
}

export interface PercentSize {
  width: number;
  height: number;
}

/** Boîte englobante en pourcentage : coin haut-gauche + dimensions. */
export interface PercentBounds extends PercentPoint, PercentSize {}

export interface PixelSize {
  width: number;
  height: number;
}

/** Média après application des valeurs par défaut (1280×720, image). */
export interface ResolvedMedia {
  kind: "image" | "video";
  name: string;
  width: number;
  height: number;
  /** Durée en secondes (vidéo uniquement), sinon null. */
  duration: number | null;
}

/** Fenêtre d'apparition normalisée (vidéo) ; endTime null = jusqu'à la fin. */
export interface TimeWindow {
  startTime: number;
  endTime: number | null;
}

interface DescriptorBase {
  id: string;
  /** Libellé français affiché dans l'éditeur (« Rond », « Flèche », « Feutre »…). */
  label: string;
  /** Couleur normalisée (hex majuscule quand c'est un hex). */
  color: string;
  /** Nom français de la couleur si elle fait partie de la palette, sinon null. */
  colorName: string | null;
  /** Zone de la grille 3×3, calculée sur le CENTRE de l'élément. */
  position: Zone;
  /** Centre de l'élément, en % (arrondi à 0,1). */
  positionPercent: PercentPoint;
  /** Boîte englobante, en % (arrondie à 0,1). */
  boundsPercent: PercentBounds;
  /** Fenêtre d'apparition (vidéo) ; null pour une image. */
  timing: TimeWindow | null;
  motionTracking: boolean;
}

export interface ShapeDescriptor extends DescriptorBase {
  type: "shape";
  shapeType: ShapeKind;
  size: SizeCategory;
  sizePercent: PercentSize;
  pixelDimensions: PixelSize;
}

export interface Shape3DDescriptor extends DescriptorBase {
  type: "shape3d";
  shape3dType: Shape3DKind;
  size: SizeCategory;
  sizePercent: PercentSize;
  pixelDimensions: PixelSize;
  /** Rotations brutes en radians. */
  rotation: { x: number; y: number };
}

export interface TextDescriptor extends DescriptorBase {
  type: "text";
  /** Contenu, espaces blancs normalisés (une seule ligne). */
  content: string;
  /** Taille de police en pixels natifs. */
  fontSize: number;
}

export interface LineDescriptor extends DescriptorBase {
  type: "line";
  lineType: LineKind;
  startPosition: PercentPoint;
  endPosition: PercentPoint;
  strokeWidth: number;
}

export interface StrokeDescriptor extends DescriptorBase {
  type: "stroke";
  tool: StrokeTool;
  pointCount: number;
  strokeWidth: number;
}

export type ElementDescriptor =
  ShapeDescriptor | Shape3DDescriptor | TextDescriptor | LineDescriptor | StrokeDescriptor;

export interface ElementsSummary {
  /** Nombre d'éléments décrits (visibles à un moment donné). */
  totalElements: number;
  shapes: number;
  shape3d: number;
  texts: number;
  lines: number;
  strokes: number;
  /** Éléments ignorés car jamais visibles (fenêtre vide, texte vide, tracé sans point…). */
  ignored: number;
}

export interface ElementGroups {
  shapes: ShapeDescriptor[];
  shape3d: Shape3DDescriptor[];
  texts: TextDescriptor[];
  lines: LineDescriptor[];
  strokes: StrokeDescriptor[];
}

/** Résultat de l'analyse : source unique de toutes les sorties texte et JSON. */
export interface ElementsAnalysis {
  media: ResolvedMedia;
  groups: ElementGroups;
  /** Éléments décrits, regroupés par type : formes, 3D, textes, lignes, tracés. */
  elements: ElementDescriptor[];
  summary: ElementsSummary;
}

/** Équivalent de `generateElementsDescription` (version d'origine). */
export interface ElementsDescription {
  /** Description française (gabarits d'origine + couleur, fenêtre temporelle). */
  description: string;
  elements: ElementDescriptor[];
  summary: ElementsSummary;
  userIntent: string;
  mediaInfo: ResolvedMedia;
}

/** Export JSON structuré (« Télécharger JSON » / « Voir JSON »). */
export interface StructuredExport {
  version: number;
  generator: string;
  /** Date d'export ISO 8601. */
  exportedAt: string;
  mediaInfo: ResolvedMedia;
  userIntent: string;
  summary: ElementsSummary;
  elements: ElementDescriptor[];
  /** Description française (identique à celle du prompt envoyé). */
  description: string;
  prompts: {
    /** Texte transmis par « Envoyer à l'API ». */
    send: string;
    /** Prompt complet anglais (« Copier le prompt », vue « Complet »). */
    full: string;
  };
}
