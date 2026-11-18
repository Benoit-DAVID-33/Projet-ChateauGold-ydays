import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/pages/auth/LoginPage";
import { mockFetch, renderWithProviders, TEST_USER } from "@/test/utils";

import { safeNext } from "./safeNext";

afterEach(() => vi.unstubAllGlobals());

describe("safeNext (anti open-redirect)", () => {
  it.each([
    ["/video", "/video"],
    ["/image/123?x=1", "/image/123?x=1"],
    [null, "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["javascript:alert(1)", "/"],
  ])("%s donne %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("LoginPage", () => {
  it("connecte l'utilisateur puis redirige vers la destination interne", async () => {
    const fetch = mockFetch([
      { path: "/api/auth/me", status: 401, body: { error: { message: "non connecté" } } },
      { path: "/api/auth/csrf", body: { csrf_token: "t" } },
      { method: "POST", path: "/api/auth/login", body: TEST_USER },
    ]);
    renderWithProviders(<LoginPage />, { route: "/login?next=/video", path: "/login" });

    await userEvent.type(await screen.findByLabelText(/nom d'utilisateur/i), "alice");
    await userEvent.type(screen.getByLabelText(/mot de passe/i), "motdepasse");
    await userEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText("autre page")).toBeInTheDocument());
    const loginCall = fetch.mock.calls.find(([url]) => url === "/api/auth/login");
    expect(JSON.parse(String((loginCall?.[1] as RequestInit).body))).toEqual({
      identifier: "alice",
      password: "motdepasse",
    });
  });

  it("affiche l'erreur renvoyée par l'API", async () => {
    mockFetch([
      { path: "/api/auth/me", status: 401, body: {} },
      { path: "/api/auth/csrf", body: { csrf_token: "t" } },
      {
        method: "POST",
        path: "/api/auth/login",
        status: 401,
        body: { error: { code: "authentication_failed", message: "Identifiants incorrects" } },
      },
    ]);
    renderWithProviders(<LoginPage />, { route: "/login", path: "/login" });
    await userEvent.type(await screen.findByLabelText(/nom d'utilisateur/i), "alice");
    await userEvent.type(screen.getByLabelText(/mot de passe/i), "faux");
    await userEvent.click(screen.getByRole("button", { name: /se connecter/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Identifiants incorrects");
  });
});

describe("AuthProvider.logout", () => {
  it("efface l'utilisateur courant (régression : l'ancien utilisateur restait affiché)", async () => {
    const { useAuth, AuthProvider } = await import("./AuthProvider");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { render } = await import("@testing-library/react");
    document.cookie = "goldfx_csrf=t; path=/";
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { method: "POST", path: "/api/auth/logout", status: 204 },
    ]);
    function Probe() {
      const { user, logout } = useAuth();
      return (
        <button type="button" onClick={() => void logout()}>
          {user ? `connecté:${user.username}` : "déconnecté"}
        </button>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByText("connecté:alice"));
    expect(await screen.findByText("déconnecté")).toBeInTheDocument();
  });
});
