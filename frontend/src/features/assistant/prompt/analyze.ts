/**
 * Analyse des annotations : transforme les éléments bruts de l'éditeur en
 * descripteurs (pourcentages, zone, taille, couleur, fenêtre temporelle).
 *
 * C'est la SOURCE DE VÉRITÉ UNIQUE : la description française, le prompt
 * complet anglais, le prompt envoyé et l'export JSON sont tous rendus à partir
 * de ce résultat, ils ne peuvent donc pas se contredire.
 */
import {
  LINE_LABELS,
  SHAPE3D_LABELS,
  SHAPE_LABELS,
  type AnnotationElement,
  type MediaInfo,
  type StrokeTool,
} from "@/features/editor/model/types";

import { colorName, normalizeColor } from "./format";
import {
  boxCenter,
  elementBox,
  isEverVisible,
  normalizeText,
  positionZone,
  resolveMedia,
  sizeCategory,
  timeWindow,
  toPercent,
} from "./geometry";
import type { ElementDescriptor, ElementGroups, ElementsAnalysis, ResolvedMedia } from "./types";

/** Libellés des outils de dessin libre (sous-menu « Palette de couleurs »). */
export const STROKE_LABELS: Record<StrokeTool, string> = {
  marker: "Feutre",
  pencil: "Crayon",
  eraser: "Gomme",
};

export const TEXT_LABEL = "Texte";

/** Champs communs à tous les descripteurs. */
function describeBase(element: AnnotationElement, media: ResolvedMedia) {
  const box = elementBox(element);
  const center = boxCenter(box);
  const positionPercent = {
    x: toPercent(center.x, media.width),
    y: toPercent(center.y, media.height),
  };
  const color = normalizeColor(element.color);
  return {
    id: element.id,
    color,
    colorName: colorName(color, "fr"),
    // Zone calculée sur les pourcentages ARRONDIS affichés : texte et zone
    // restent cohérents aux bornes (32,96 % s'affiche 33.0 %, donc Centre).
    position: positionZone(positionPercent.x, positionPercent.y),
    positionPercent,
    boundsPercent: {
      x: toPercent(box.left, media.width),
      y: toPercent(box.top, media.height),
      width: toPercent(box.width, media.width),
      height: toPercent(box.height, media.height),
    },
    timing: timeWindow(element, media),
    motionTracking: element.motionTracking === true,
  };
}

/** Taille relative et dimensions natives (formes 2D et objets 3D). */
function describeSize(
  element: { width: number; height: number },
  base: ReturnType<typeof describeBase>,
) {
  const sizePercent = { width: base.boundsPercent.width, height: base.boundsPercent.height };
  return {
    size: sizeCategory(sizePercent.width, sizePercent.height),
    sizePercent,
    pixelDimensions: { width: Math.abs(element.width), height: Math.abs(element.height) },
  };
}

// Ordre des clés pensé pour la lisibilité du JSON : type, id, libellé, sous-type,
// puis champs communs.
function describeElement(element: AnnotationElement, media: ResolvedMedia): ElementDescriptor {
  const base = describeBase(element, media);
  const { id, ...rest } = base;
  switch (element.type) {
    case "shape":
      return {
        type: "shape",
        id,
        label: SHAPE_LABELS[element.shape] ?? element.shape,
        shapeType: element.shape,
        ...rest,
        ...describeSize(element, base),
      };
    case "shape3d":
      return {
        type: "shape3d",
        id,
        label: SHAPE3D_LABELS[element.shape] ?? element.shape,
        shape3dType: element.shape,
        ...rest,
        ...describeSize(element, base),
        rotation: { x: element.rotationX || 0, y: element.rotationY || 0 },
      };
    case "text":
      return {
        type: "text",
        id,
        label: TEXT_LABEL,
        content: normalizeText(element.text),
        ...rest,
        fontSize: element.fontSize,
      };
    case "line":
      return {
        type: "line",
        id,
        label: LINE_LABELS[element.line] ?? element.line,
        lineType: element.line,
        ...rest,
        startPosition: {
          x: toPercent(element.start.x, media.width),
          y: toPercent(element.start.y, media.height),
        },
        endPosition: {
          x: toPercent(element.end.x, media.width),
          y: toPercent(element.end.y, media.height),
        },
        strokeWidth: element.strokeWidth,
      };
    case "stroke":
      return {
        type: "stroke",
        id,
        label: STROKE_LABELS[element.tool] ?? element.tool,
        tool: element.tool,
        ...rest,
        pointCount: element.points.length,
        strokeWidth: element.strokeWidth,
      };
  }
}

/**
 * Analyse les éléments pour un média donné (null : image 1280×720).
 * Seuls les éléments visibles à un moment donné sont décrits ; les autres
 * sont comptés dans `summary.ignored`.
 */
export function analyzeElements(
  elements: readonly AnnotationElement[],
  mediaInfo: MediaInfo | null | undefined,
): ElementsAnalysis {
  const media = resolveMedia(mediaInfo);
  const groups: ElementGroups = { shapes: [], shape3d: [], texts: [], lines: [], strokes: [] };

  for (const element of elements) {
    if (!isEverVisible(element, media)) continue;
    const descriptor = describeElement(element, media);
    switch (descriptor.type) {
      case "shape":
        groups.shapes.push(descriptor);
        break;
      case "shape3d":
        groups.shape3d.push(descriptor);
        break;
      case "text":
        groups.texts.push(descriptor);
        break;
      case "line":
        groups.lines.push(descriptor);
        break;
      case "stroke":
        groups.strokes.push(descriptor);
        break;
    }
  }

  // Ordre d'origine : regroupement par type, pas ordre de création.
  const described: ElementDescriptor[] = [
    ...groups.shapes,
    ...groups.shape3d,
    ...groups.texts,
    ...groups.lines,
    ...groups.strokes,
  ];

  return {
    media,
    groups,
    elements: described,
    summary: {
      totalElements: described.length,
      shapes: groups.shapes.length,
      shape3d: groups.shape3d.length,
      texts: groups.texts.length,
      lines: groups.lines.length,
      strokes: groups.strokes.length,
      ignored: elements.length - described.length,
    },
  };
}

/**
 * Variante de l'analyse sans aucune annotation décrite (case « Inclure les
 * annotations » décochée) : même média, prompts rendus sans éléments.
 */
export function withoutElements(analysis: ElementsAnalysis): ElementsAnalysis {
  return {
    media: analysis.media,
    groups: { shapes: [], shape3d: [], texts: [], lines: [], strokes: [] },
    elements: [],
    summary: {
      totalElements: 0,
      shapes: 0,
      shape3d: 0,
      texts: 0,
      lines: 0,
      strokes: 0,
      ignored: analysis.summary.totalElements + analysis.summary.ignored,
    },
  };
}
