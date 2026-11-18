/**
 * Génération Kling commune aux nœuds « Texte vers image », « Texte vers vidéo »,
 * « Image vers vidéo » et « Omni-Video » : création de la tâche, suivi toutes
 * les 5 s (séquentiel, comme l'onglet Génération) jusqu'à l'état final ou
 * 30 min, puis récupération du premier média produit.
 *
 * L'arrêt du workflow interrompt le suivi côté navigateur ; la tâche déjà
 * envoyée à Kling peut se terminer côté serveur (elle reste dans l'historique).
 */
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, STATUS_LABELS } from "@/features/generation/hooks";
import type { Generation, GenerationIn, Media } from "@/shared/api/client";

import type { ExecutionContext } from "../engine/types";

export const KLING_POLL_INTERVAL_MS = POLL_INTERVAL_MS;
export const KLING_TIMEOUT_MS = POLL_TIMEOUT_MS;
export const KLING_MAX_PROMPT_LENGTH = 2500;

export interface Option {
  value: string;
  label: string;
}

/** Formats acceptés par le backend pour les images. */
export const IMAGE_RATIOS: readonly Option[] = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
].map((value) => ({ value, label: value }));

/** Formats proposés pour les vidéos. */
export const VIDEO_RATIOS: readonly Option[] = ["16:9", "9:16", "1:1"].map((value) => ({
  value,
  label: value,
}));

export const DURATIONS: readonly Option[] = [
  { value: "5", label: "5 s" },
  { value: "10", label: "10 s" },
];

export const QUALITIES: readonly Option[] = [
  { value: "std", label: "Standard" },
  { value: "pro", label: "Pro" },
];

/** Requête complète avec les valeurs par défaut de l'API. */
export function klingRequest(
  payload: Pick<GenerationIn, "kind"> & Partial<GenerationIn>,
): GenerationIn {
  return {
    prompt: "",
    negative_prompt: "",
    aspect_ratio: null,
    duration: "5",
    mode: "std",
    count: 1,
    source_media_id: null,
    refer_type: "base",
    keep_original_sound: true,
    ...payload,
  };
}

/** Vérifie le prompt avant d'envoyer la tâche (évite un aller-retour inutile). */
export function checkPrompt(prompt: string, required: boolean): string {
  const clean = prompt.trim();
  if (required && !clean) throw new Error("Le prompt est vide : connectez un texte non vide.");
  if (clean.length > KLING_MAX_PROMPT_LENGTH)
    throw new Error(`Prompt trop long (${KLING_MAX_PROMPT_LENGTH} caractères maximum).`);
  return clean;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, "0")} s` : `${seconds} s`;
}

export interface KlingResult {
  generation: Generation;
  /** Premier média produit (sortie du nœud). */
  media: Media;
  /** Tous les médias produits. */
  mediaIds: string[];
}

export async function runKlingGeneration(
  ctx: ExecutionContext,
  payload: GenerationIn,
): Promise<KlingResult> {
  const { api, clock, signal } = ctx;
  signal.throwIfAborted();
  const started = clock.now();
  let generation = await api.generation.create(payload);
  signal.throwIfAborted();

  while (generation.status !== "succeeded" && generation.status !== "failed") {
    const elapsed = clock.now() - started;
    if (elapsed >= KLING_TIMEOUT_MS) {
      throw new Error(
        "Délai dépassé : la génération n'est pas terminée après 30 minutes. Elle reste consultable dans l'historique.",
      );
    }
    ctx.reportProgress({
      message: `${STATUS_LABELS[generation.status]} (${formatElapsed(elapsed)})`,
    });
    await clock.sleep(KLING_POLL_INTERVAL_MS, signal);
    generation = await api.generation.get(generation.id);
    signal.throwIfAborted();
  }

  if (generation.status === "failed")
    throw new Error(generation.error_message || "La génération Kling a échoué.");
  const [firstId] = generation.result_media_ids;
  if (!firstId) throw new Error("La génération n'a renvoyé aucun résultat.");
  ctx.reportProgress({ message: "Récupération du résultat…", value: 1 });
  const media = await api.media.get(firstId);
  return { generation, media, mediaIds: [...generation.result_media_ids] };
}

/** Message de fin : « 3 résultats ; le premier est transmis. » */
export function resultMessage(result: KlingResult): string {
  const count = result.mediaIds.length;
  return count > 1
    ? `${count} résultats générés ; le premier (${result.media.name}) est transmis.`
    : `Résultat : ${result.media.name}`;
}
