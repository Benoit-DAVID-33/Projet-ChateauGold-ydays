/**
 * Dépendances externes du workflow (API HTTP et horloge), injectées pour que
 * les tests utilisent des doubles (inversion de dépendance).
 */
import { generationApi, mediaApi, workflowApi } from "@/shared/api/endpoints";

export interface WorkflowServices {
  media: Pick<typeof mediaApi, "list" | "get" | "process">;
  generation: Pick<typeof generationApi, "create" | "get">;
  workflows: Pick<typeof workflowApi, "list" | "get" | "create" | "update" | "remove">;
}

export const defaultWorkflowServices: WorkflowServices = {
  media: mediaApi,
  generation: generationApi,
  workflows: workflowApi,
};

/** Temps et attente, injectables (les tests n'attendent pas réellement). */
export interface Clock {
  now(): number;
  /** Attend `ms` millisecondes ; rejette (AbortError) dès que `signal` est annulé. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export function abortError(): DOMException {
  return new DOMException("Exécution arrêtée", "AbortError");
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    }),
};
