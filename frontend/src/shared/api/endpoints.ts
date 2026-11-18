/** Fonctions d'accès à l'API, une par endpoint (contrat : backend/openapi.json). */
import {
  request,
  requestRaw,
  type Generation,
  type GenerationIn,
  type Media,
  type MediaKind,
  type SearchResult,
  type User,
  type Workflow,
  type WorkflowIn,
  type WorkflowSummary,
} from "./client";

export const authApi = {
  me: () => request<User>("/api/auth/me"),
  login: (identifier: string, password: string) =>
    request<User>("/api/auth/login", { json: { identifier, password } }),
  register: (username: string, email: string, password: string) =>
    request<User>("/api/auth/register", { json: { username, email, password } }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
};

export interface UploadOptions {
  /** Export de l'éditeur rattaché au média d'origine. */
  asExportOf?: string;
  signal?: AbortSignal;
}

/** Pagination des listes (au plus 200 éléments par page côté API). */
export interface PageOptions {
  limit?: number;
  offset?: number;
}

/** Chaîne de requête sans les paramètres absents. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const mediaApi = {
  /** Médias du plus récent au plus ancien ; `parentId` : dérivés d'un média. */
  list: (kind?: MediaKind, options: PageOptions & { parentId?: string } = {}) =>
    request<Media[]>(
      `/api/media${query({
        kind,
        limit: options.limit ?? 200,
        offset: options.offset || undefined,
        parent_id: options.parentId,
      })}`,
    ),
  get: (id: string) => request<Media>(`/api/media/${id}`),
  upload: (file: Blob, filename: string, options: UploadOptions = {}) => {
    const form = new FormData();
    form.append("file", file, filename);
    if (options.asExportOf !== undefined) {
      form.append("as_export", "true");
      form.append("parent_id", options.asExportOf);
    }
    return request<Media>("/api/media", { form, signal: options.signal });
  },
  remove: (id: string) => request<void>(`/api/media/${id}`, { method: "DELETE" }),
  process: (id: string, query: string) =>
    request<Media>(`/api/media/${id}/process`, { json: { query } }),
  downloadUrl: (media: Media) => `${media.content_url}?download=true`,
};

export const searchApi = {
  search: (query: string, mediaId?: string) =>
    request<SearchResult>("/api/search", { json: { query, media_id: mediaId ?? null } }),
};

export const generationApi = {
  create: (payload: GenerationIn) => request<Generation>("/api/generations", { json: payload }),
  get: (id: string) => request<Generation>(`/api/generations/${id}`),
  /** Générations de la plus récente à la plus ancienne ; `sourceMediaId` : à partir d'un média. */
  list: (options: PageOptions & { sourceMediaId?: string } = {}) =>
    request<Generation[]>(
      `/api/generations${query({
        limit: options.limit ?? 50,
        offset: options.offset || undefined,
        source_media_id: options.sourceMediaId,
      })}`,
    ),
  providerHealth: () =>
    request<{ ok: boolean; message: string }>("/api/generations/provider/health"),
};

export const transcodeApi = {
  /** Convertit l'enregistrement WebM et renvoie le MP4 (Blob) à télécharger. */
  webmToMp4: async (webm: Blob): Promise<Blob> => {
    const form = new FormData();
    form.append("file", webm, "enregistrement.webm");
    const response = await requestRaw("/api/transcode/webm-to-mp4", { form });
    return response.blob();
  },
  /** Convertit et enregistre le MP4 dans la bibliothèque. */
  webmToLibrary: (webm: Blob, parentId?: string) => {
    const form = new FormData();
    form.append("file", webm, "enregistrement.webm");
    form.append("save_to_library", "true");
    if (parentId) form.append("parent_id", parentId);
    return request<Media>("/api/transcode/webm-to-mp4", { form });
  },
};

export const contactApi = {
  send: (name: string, email: string, message: string) =>
    request<{ status: string }>("/api/contact", { json: { name, email, message } }),
};

export const workflowApi = {
  list: () => request<WorkflowSummary[]>("/api/workflows"),
  get: (id: string) => request<Workflow>(`/api/workflows/${id}`),
  create: (payload: WorkflowIn) => request<Workflow>("/api/workflows", { json: payload }),
  update: (id: string, payload: WorkflowIn) =>
    request<Workflow>(`/api/workflows/${id}`, { method: "PUT", json: payload }),
  remove: (id: string) => request<void>(`/api/workflows/${id}`, { method: "DELETE" }),
};
