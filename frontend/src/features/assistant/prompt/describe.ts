/**
 * Description française des éléments (`generateElementsDescription`) et
 * résumé (`generateSummary`). Gabarits v1 : structure d'origine conservée,
 * SANS emoji ni puce décorative (titres de section en texte simple, puces
 * « - »), complétée par la couleur réelle, la fenêtre temporelle (vidéo), les
 * tracés à main levée et les libellés français de l'éditeur.
 */
import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { analyzeElements } from "./analyze";
import { fixed, formatColor, formatPercent, formatTimingFr } from "./format";
import type {
  ElementDescriptor,
  ElementsAnalysis,
  ElementsDescription,
  ElementsSummary,
  PercentPoint,
} from "./types";

const INDENT = "     ";
const MOTION_TRACKING_FR = `${INDENT}Motion Tracking: ACTIVÉ (suit les mouvements de la vidéo)\n`;

const point = ({ x, y }: PercentPoint) => `(${formatPercent(x)}%, ${formatPercent(y)}%)`;

/** Lignes communes de fin de bloc : couleur (ou effet de la gomme), fenêtre, tracking. */
function tailLines(descriptor: ElementDescriptor): string {
  let out =
    descriptor.type === "stroke" && descriptor.tool === "eraser"
      ? `${INDENT}Effet: efface les tracés situés sous son passage\n`
      : `${INDENT}Couleur: ${formatColor(descriptor.color, "fr")}\n`;
  const timing = formatTimingFr(descriptor.timing);
  if (timing) out += `${INDENT}${timing}\n`;
  if (descriptor.motionTracking) out += MOTION_TRACKING_FR;
  return out;
}

/** Rend la description française à partir d'une analyse. */
export function renderDescription({ groups }: ElementsAnalysis): string {
  let out = "";

  if (groups.shapes.length > 0) {
    out += `**FORMES GÉOMÉTRIQUES** (${groups.shapes.length}):\n`;
    groups.shapes.forEach((shape, index) => {
      out +=
        `  ${index + 1}. **${shape.label}** (${shape.id})\n` +
        `${INDENT}Position: ${shape.position} ${point(shape.positionPercent)}\n` +
        `${INDENT}Taille: ${shape.size} (${formatPercent(shape.sizePercent.width)}% × ${formatPercent(shape.sizePercent.height)}%)\n` +
        `${INDENT}Dimensions en pixels: ${Math.round(shape.pixelDimensions.width)}×${Math.round(shape.pixelDimensions.height)}px\n` +
        tailLines(shape);
    });
    out += "\n";
  }

  if (groups.shape3d.length > 0) {
    out += `**OBJETS 3D** (${groups.shape3d.length}):\n`;
    groups.shape3d.forEach((object, index) => {
      out +=
        `  ${index + 1}. **${object.label}** (${object.id})\n` +
        `${INDENT}Position: ${object.position} ${point(object.positionPercent)}\n` +
        `${INDENT}Taille: ${object.size} (${formatPercent(object.sizePercent.width)}% × ${formatPercent(object.sizePercent.height)}%)\n` +
        `${INDENT}Rotation X: ${fixed(object.rotation.x, 2)} rad | Rotation Y: ${fixed(object.rotation.y, 2)} rad\n` +
        tailLines(object);
    });
    out += "\n";
  }

  if (groups.texts.length > 0) {
    out += `**TEXTES** (${groups.texts.length}):\n`;
    groups.texts.forEach((text, index) => {
      out +=
        `  ${index + 1}. "${text.content}" (${text.id})\n` +
        `${INDENT}Position: ${text.position} ${point(text.positionPercent)}\n` +
        `${INDENT}Taille police: ${Math.round(text.fontSize)}px\n` +
        tailLines(text);
    });
    out += "\n";
  }

  if (groups.lines.length > 0) {
    out += `**LIGNES/CONNECTEURS** (${groups.lines.length}):\n`;
    groups.lines.forEach((line, index) => {
      out +=
        `  ${index + 1}. **${line.label}** (${line.id})\n` +
        `${INDENT}Du: ${point(line.startPosition)}\n` +
        `${INDENT}Au: ${point(line.endPosition)}\n` +
        tailLines(line);
    });
    out += "\n";
  }

  if (groups.strokes.length > 0) {
    out += `**TRACÉS À MAIN LEVÉE** (${groups.strokes.length}):\n`;
    groups.strokes.forEach((stroke, index) => {
      const { x, y, width, height } = stroke.boundsPercent;
      out +=
        `  ${index + 1}. **${stroke.label}** (${stroke.id})\n` +
        `${INDENT}Zone couverte: ${stroke.position}, de ${point({ x, y })} à ${point({ x: x + width, y: y + height })}\n` +
        tailLines(stroke);
    });
    out += "\n";
  }

  return out;
}

/**
 * Équivalent typé de `generateElementsDescription` : description française +
 * descripteurs + compteurs. `mediaInfo` null : image 1280×720.
 */
export function describeElements(
  elements: readonly AnnotationElement[],
  mediaInfo: MediaInfo | null | undefined,
  userIntent = "",
): ElementsDescription {
  const analysis = analyzeElements(elements, mediaInfo);
  return {
    description: renderDescription(analysis),
    elements: analysis.elements,
    summary: analysis.summary,
    userIntent,
    mediaInfo: analysis.media,
  };
}

/** Rend le résumé « Composition actuelle » à partir d'une analyse. */
export function renderSummary({ summary }: ElementsAnalysis): string {
  const shape3d = summary.shape3d > 0 ? `\n   - ${summary.shape3d} objet(s) 3D` : "";
  const strokes = summary.strokes > 0 ? `\n   - ${summary.strokes} tracé(s) à main levée` : "";
  const ignored =
    summary.ignored > 0 ? `\n   (${summary.ignored} élément(s) jamais visible(s), ignoré(s))` : "";
  return (
    `Composition actuelle:\n   - ${summary.shapes} forme(s)${shape3d}` +
    `\n   - ${summary.texts} texte(s)\n   - ${summary.lines} ligne(s)${strokes}` +
    `\n   Total: ${summary.totalElements} éléments${ignored}`
  );
}

/**
 * Résumé « Composition actuelle » (`generateSummary`). `mediaInfo` sert
 * uniquement à exclure les éléments placés après la fin d'une vidéo.
 */
export function summarizeElements(
  elements: readonly AnnotationElement[],
  mediaInfo?: MediaInfo | null,
): string {
  return renderSummary(analyzeElements(elements, mediaInfo));
}

/** « 1 forme » / « 2 formes » (le français met le singulier à 0 et 1). */
function count(value: number, singular: string, plural: string): string {
  return `${value} ${value > 1 ? plural : singular}`;
}

/**
 * Résumé compact sur une ligne (colonne « Atelier ») :
 * « 3 éléments : 1 forme, 1 texte, 1 ligne (1 ignoré, jamais visible) ».
 */
export function renderCompactSummary(summary: ElementsSummary): string {
  const parts = [
    summary.shapes > 0 && count(summary.shapes, "forme", "formes"),
    summary.shape3d > 0 && count(summary.shape3d, "objet 3D", "objets 3D"),
    summary.texts > 0 && count(summary.texts, "texte", "textes"),
    summary.lines > 0 && count(summary.lines, "ligne", "lignes"),
    summary.strokes > 0 && count(summary.strokes, "tracé", "tracés"),
  ].filter((part): part is string => typeof part === "string");

  let text =
    summary.totalElements > 0
      ? `${count(summary.totalElements, "élément", "éléments")} : ${parts.join(", ")}`
      : summary.ignored > 0
        ? "Aucune annotation visible"
        : "Aucune annotation";
  if (summary.ignored > 0) {
    text += ` (${count(summary.ignored, "ignoré", "ignorés")}, jamais ${summary.ignored > 1 ? "visibles" : "visible"})`;
  }
  return text;
}
