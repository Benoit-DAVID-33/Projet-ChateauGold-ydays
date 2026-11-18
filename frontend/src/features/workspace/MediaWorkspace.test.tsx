import "@/features/workflow/test/setupDom";

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockFetch, renderWithProviders, TEST_USER } from "@/test/utils";

import { MediaWorkspace } from "./MediaWorkspace";

afterEach(() => vi.unstubAllGlobals());

describe("MediaWorkspace", () => {
  it("passe de l'Atelier au Workflow sans démonter l'Atelier", async () => {
    mockFetch([
      { path: "/api/auth/me", body: TEST_USER },
      { path: /^\/api\/generations\?/, body: [] },
      { path: "/api/workflows", body: [] },
      { path: /\/api\/media/, body: [] },
    ]);
    renderWithProviders(<MediaWorkspace media={null} pageKind="image" />);

    const atelierTab = screen.getByRole("tab", { name: "Atelier" });
    const workflowTab = screen.getByRole("tab", { name: "Workflow" });
    expect(atelierTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tablist", { name: "Mode de l'Atelier" })).toBeVisible();

    await userEvent.type(screen.getByLabelText("Prompt"), "un phare");
    await userEvent.click(workflowTab);
    expect(workflowTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: "Éditeur de workflow" })).toBeVisible();
    expect(document.getElementById("workspace-panel-atelier")).not.toBeVisible();

    await userEvent.click(atelierTab);
    // L'état de l'Atelier (prompt saisi) est conservé.
    expect(screen.getByLabelText("Prompt")).toHaveValue("un phare");
    expect(document.getElementById("workspace-panel-workflow")).not.toBeVisible();
  });
});
