/**
 * Prompt complet en anglais (`generateFullPrompt`) : c'est le texte copié par
 * « Copier le prompt » (vue « Complet ») pour être collé dans un autre outil
 * d'IA. Gabarits d'origine conservés ; corrections : section 3D lue depuis
 * les vrais champs, vraie couleur, fenêtre temporelle, tracés à main levée,
 * repère des coordonnées explicité (centre de l'élément).
 */
import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { analyzeElements } from "./analyze";
import { fixed, formatColor, formatPercent, formatSecondsEn, formatTimingEn } from "./format";
import type { ElementDescriptor, ElementsAnalysis, PercentPoint } from "./types";

const RULE = "====================================";

/** Précise le repère des coordonnées (absent de l'original, source d'ambiguïté). */
export const COORDINATES_NOTE_EN =
  "Coordinates are percentages of the frame (0% = left/top edge, 100% = right/bottom edge), measured at each element's center.";

const LINE_STYLE_EN: Record<string, string> = {
  "straight-arrow": "straight-arrow (straight line with an arrowhead at the end point)",
  curved: "curved (smooth curved line)",
  zigzag: "zigzag (twisted zigzag line)",
};

const STROKE_TOOL_EN: Record<string, string> = {
  marker: "MARKER (semi-transparent highlighter)",
  pencil: "PENCIL (thin freehand line)",
  eraser: "ERASER",
};

const point = ({ x, y }: PercentPoint) => `(${formatPercent(x)}%, ${formatPercent(y)}%)`;

const tracking = (descriptor: ElementDescriptor) =>
  `\n   - Motion Tracking: ${descriptor.motionTracking ? "ENABLED" : "Disabled"}`;

const color = (descriptor: ElementDescriptor) =>
  `\n   - Color: ${formatColor(descriptor.color, "en")}`;

function timing(descriptor: ElementDescriptor): string {
  const text = formatTimingEn(descriptor.timing);
  return text ? `\n   - ${text}` : "";
}

/** Rend le prompt complet anglais à partir d'une analyse. */
export function renderFullPrompt(analysis: ElementsAnalysis, userIntent: string): string {
  const intent = userIntent.trim();
  const { media, groups, summary } = analysis;
  const resolution = `${media.width}×${media.height}`;

  if (summary.totalElements === 0) {
    return `
CONTEXT - Visual Effects Edition:
- Media Type: ${media.kind}
- Resolution: ${resolution}

USER INTENTION: ${intent || "No specific intention provided"}

No elements defined for this task.
`;
  }

  const duration =
    media.duration !== null ? `\n- Duration: ${formatSecondsEn(media.duration)}` : "";

  let prompt = `
=== VISUAL EFFECTS REQUEST FOR ${media.kind.toUpperCase()} ===

MEDIA SPECIFICATIONS:
- Type: ${media.kind === "video" ? "Video" : "Image"}
- Resolution: ${resolution}
- Aspect Ratio: ${fixed(media.width / media.height, 2)}:1${duration}

PRIMARY OBJECTIVE:
${intent || "Enhance visual composition with AI-generated effects"}

${RULE}
SPATIAL LAYOUT & ELEMENTS TO ENHANCE
${RULE}
${COORDINATES_NOTE_EN}`;

  if (groups.shape3d.length > 0) {
    prompt += `\n\n3D OBJECTS (${groups.shape3d.length}):`;
    groups.shape3d.forEach((object, index) => {
      prompt +=
        `\n${index + 1}. ${object.shape3dType.toUpperCase()}:` +
        `\n   - Location: ${object.position} ${point(object.positionPercent)}` +
        `\n   - Size: ${object.size} (${formatPercent(object.sizePercent.width)}% × ${formatPercent(object.sizePercent.height)}% of frame)` +
        `\n   - Rotation: X=${fixed(object.rotation.x, 2)}rad, Y=${fixed(object.rotation.y, 2)}rad` +
        color(object) +
        `\n   - Motion Tracking: ${object.motionTracking ? "ENABLED (element should follow scene movement)" : "Disabled (element is static)"}` +
        `\n   - Pixel Size: ${Math.round(object.pixelDimensions.width)} × ${Math.round(object.pixelDimensions.height)} px` +
        timing(object);
    });
  }

  if (groups.shapes.length > 0) {
    prompt += `\n\n2D GEOMETRIC SHAPES (${groups.shapes.length}):`;
    groups.shapes.forEach((shape, index) => {
      prompt +=
        `\n${index + 1}. ${shape.shapeType.toUpperCase()}:` +
        `\n   - Location: ${shape.position} ${point(shape.positionPercent)}` +
        `\n   - Size: ${formatPercent(shape.sizePercent.width)}% × ${formatPercent(shape.sizePercent.height)}% of frame` +
        color(shape) +
        tracking(shape) +
        timing(shape);
    });
  }

  if (groups.texts.length > 0) {
    prompt += `\n\nTEXT ELEMENTS (${groups.texts.length}):`;
    groups.texts.forEach((text, index) => {
      prompt +=
        `\n${index + 1}. "${text.content}":` +
        `\n   - Location: ${text.position} ${point(text.positionPercent)}` +
        `\n   - Font Size: ${Math.round(text.fontSize)}px` +
        color(text) +
        tracking(text) +
        timing(text);
    });
  }

  if (groups.lines.length > 0) {
    prompt += `\n\nLINES & PATHS (${groups.lines.length}):`;
    groups.lines.forEach((line, index) => {
      prompt +=
        `\n${index + 1}. ${line.lineType.toUpperCase()}:` +
        `\n   - From: ${point(line.startPosition)} To: ${point(line.endPosition)}` +
        `\n   - Style: ${LINE_STYLE_EN[line.lineType] ?? line.lineType}` +
        color(line) +
        tracking(line) +
        timing(line);
    });
  }

  if (groups.strokes.length > 0) {
    prompt += `\n\nFREEHAND STROKES (${groups.strokes.length}):`;
    groups.strokes.forEach((stroke, index) => {
      const { x, y, width, height } = stroke.boundsPercent;
      const effect =
        stroke.tool === "eraser"
          ? "\n   - Effect: erases the drawings along its path"
          : color(stroke);
      prompt +=
        `\n${index + 1}. ${STROKE_TOOL_EN[stroke.tool] ?? stroke.tool.toUpperCase()}:` +
        `\n   - Area: ${stroke.position}, from ${point({ x, y })} to ${point({ x: x + width, y: y + height })}` +
        effect +
        tracking(stroke) +
        timing(stroke);
    });
  }

  const tracked = analysis.elements.filter((element) => element.motionTracking).length;

  prompt += `

${RULE}
ELEMENT SUMMARY
${RULE}
- Total Elements: ${summary.totalElements}
- 3D Objects: ${summary.shape3d}
- 2D Shapes: ${summary.shapes}
- Text Elements: ${summary.texts}
- Lines/Paths: ${summary.lines}
- Freehand Strokes: ${summary.strokes}
- Elements with Motion Tracking: ${tracked}

${RULE}
INSTRUCTIONS FOR GENERATIVE AI
${RULE}
1. Respect all spatial coordinates provided (position, size, rotation)
2. Apply effects in the specified zones/areas
3. For motion-tracked elements: ensure the effect follows the element/scene movement
4. For static elements: keep the effect in the exact position specified
5. Scale effects appropriately based on element sizes
6. Maintain visual harmony across all elements
7. Execute the primary objective: ${intent || "Improve visual composition"}

${RULE}
EXPECTED RESULT
${RULE}
A ${media.kind === "video" ? "video" : "high-resolution image"} with:
- All specified effects applied at exact coordinates
- Seamless integration of visual enhancements
- Professional-quality output matching input resolution (${resolution})
- Consistency with the user's creative vision

Start generation now.`;

  return prompt;
}

/**
 * Prompt complet anglais (`generateFullPrompt`), destiné à être copié dans un
 * autre outil d'IA. `mediaInfo` null : image 1280×720.
 */
export function buildFullPrompt(
  elements: readonly AnnotationElement[],
  userIntent: string,
  mediaInfo: MediaInfo | null | undefined,
): string {
  return renderFullPrompt(analyzeElements(elements, mediaInfo), userIntent);
}
