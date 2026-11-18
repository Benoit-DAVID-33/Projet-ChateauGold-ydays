import { ApiError, csrfToken, type Media } from "@/shared/api/client";

/**
 * Upload avec progression (XMLHttpRequest : fetch n'expose pas la progression
 * d'envoi). Indispensable pour les vidéos volumineuses.
 */
export async function uploadMedia(
  file: File,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Media> {
  const token = await csrfToken();
  return new Promise<Media>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", token);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Media);
        return;
      }
      const body = xhr.response as { error?: { code?: string; message?: string } } | null;
      const fallback =
        xhr.status === 413 ? "Fichier trop volumineux" : `Erreur ${xhr.status} pendant l'envoi`;
      reject(
        new ApiError(
          xhr.status,
          body?.error?.code ?? "upload_failed",
          body?.error?.message ?? fallback,
        ),
      );
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "network_error", "Impossible de joindre le serveur"));
    xhr.onabort = () => reject(new DOMException("Envoi annulé", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}
