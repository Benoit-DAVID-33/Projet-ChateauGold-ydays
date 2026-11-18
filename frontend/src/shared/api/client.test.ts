import { afterEach, describe, expect, it, vi } from "vitest";

import { mockFetch } from "@/test/utils";

import { ApiError, errorMessage, request } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "goldfx_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("client API", () => {
  it("ajoute le jeton CSRF du cookie aux écritures", async () => {
    document.cookie = "goldfx_csrf=jeton-123; path=/";
    const fetch = mockFetch([{ method: "POST", path: "/api/x", body: { ok: true } }]);
    await request("/api/x", { json: { a: 1 } });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("jeton-123");
    expect(init.body).toBe('{"a":1}');
  });

  it("récupère un jeton CSRF quand le cookie est absent", async () => {
    const fetch = mockFetch([
      { path: "/api/auth/csrf", body: { csrf_token: "frais" } },
      { method: "POST", path: "/api/x", body: {} },
    ]);
    await request("/api/x", { json: {} });
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/auth/csrf");
    const init = fetch.mock.calls[1]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("frais");
  });

  it("n'envoie pas de jeton CSRF sur un GET", async () => {
    const fetch = mockFetch([{ path: "/api/x", body: {} }]);
    await request("/api/x");
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("normalise les erreurs de l'API", async () => {
    mockFetch([
      { path: "/api/x", status: 409, body: { error: { code: "conflict", message: "Déjà pris" } } },
    ]);
    const error = await request("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "conflict", message: "Déjà pris" });
    expect(errorMessage(error)).toBe("Déjà pris");
  });

  it("signale une panne réseau de façon lisible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(request("/api/x")).rejects.toMatchObject({
      code: "network_error",
      message: "Impossible de joindre le serveur",
    });
  });

  it("gère les réponses 204 sans corps", async () => {
    mockFetch([{ method: "DELETE", path: "/api/media/1", status: 204 }]);
    document.cookie = "goldfx_csrf=t; path=/";
    await expect(request("/api/media/1", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
