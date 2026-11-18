/** Choix du format d'enregistrement WebM (ordre de préférence). */
export const RECORDER_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return RECORDER_MIME_TYPES.find((type) => isTypeSupported(type)) ?? null;
}
