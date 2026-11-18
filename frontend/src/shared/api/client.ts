/**
 * Client HTTP unique de l'application.
 * - même origine (cookies de session HttpOnly envoyés automatiquement) ;
 * - jeton CSRF ajouté à toute écriture (double-submit) ;
 * - erreurs normalisées en ApiError (message prêt à afficher, en français).
 */
import type { components } from "./schema";

export type Schemas = components["schemas"];
export type Media = Schemas["MediaOut"];
export type MediaKind = Schemas["MediaKind"];
export type User = Schemas["UserOut"];
export type Generation = Schemas["GenerationOut"];
export type GenerationKind = Schemas["GenerationKind"];
export type GenerationIn = Schemas["GenerationIn"];
export type SearchResult = Schemas["SearchOut"];
export type Workflow = Schemas["WorkflowOut"];
export type WorkflowSummary = Schemas["WorkflowSummaryOut"];
export type WorkflowIn = Schemas["WorkflowIn"];

const CSRF_COOKIE = "goldfx_csrf";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;

export async function csrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  csrfPromise ??= fetch("/api/auth/csrf", { credentials: "same-origin" })
    .then((r) => r.json() as Promise<{ csrf_token: string }>)
    .then((body) => readCookie(CSRF_COOKIE) ?? body.csrf_token)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

export async function toApiError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Erreur ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    if (response.status === 413) message = "Fichier trop volumineux";
    else if (response.status >= 500) message = "Le serveur ne répond pas correctement";
  }
  return new ApiError(response.status, code, message);
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

/** Requête brute (renvoie la Response) — utile pour les téléchargements binaires. */
export async function requestRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = options.method ?? (options.json || options.form ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  if (method !== "GET") headers["X-CSRF-Token"] = await csrfToken();

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body,
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Impossible de joindre le serveur");
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await requestRaw(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue";
}
