/** API publique du générateur de prompts (fonctions pures, sans React ni DOM). */
export { analyzeElements, STROKE_LABELS } from "./analyze";
export {
  composePrompt,
  countCharacters,
  PROMPT_MAX_LENGTH,
  type ComposePromptInput,
  type PromptComposition,
} from "./compose";
export { describeElements, summarizeElements } from "./describe";
export { buildFullPrompt, COORDINATES_NOTE_EN } from "./fullPrompt";
export { DEFAULT_MEDIA_HEIGHT, DEFAULT_MEDIA_WIDTH, positionZone, sizeCategory } from "./geometry";
export { buildSendPrompt } from "./sendPrompt";
export {
  buildStructuredExport,
  serializeStructuredExport,
  STRUCTURED_EXPORT_VERSION,
  structuredExportFilename,
  type StructuredExportOptions,
} from "./structuredExport";
export type * from "./types";
