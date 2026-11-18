import "../test/setupDom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { WorkflowHost } from "../host";
import type { WorkflowGraph } from "../model/graph";
import { workflowStore } from "../state/store";
import { fakeHost, fakeServices, makeMedia, makeWorkflow, type FakeServices } from "../test/fakes";
import { WorkflowEditor } from "./WorkflowEditor";

function renderEditor(services: FakeServices = fakeServices(), host: WorkflowHost | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <div style={{ width: 1200, height: 800 }}>
        <WorkflowEditor services={services} host={host} />
      </div>
    </QueryClientProvider>,
  );
  return { user, services };
}

const LIBRARY_TO_OUTPUT: WorkflowGraph = {
  version: 1,
  nodes: [
    {
      id: "lib",
      type: "library-media",
      position: { x: 0, y: 0 },
      data: { mediaId: "m1", mediaKind: "image", mediaName: "photo.png" },
    },
    { id: "out", type: "output", position: { x: 400, y: 0 }, data: {} },
  ],
  edges: [{ id: "e1", source: "lib", sourceHandle: "media", target: "out", targetHandle: "media" }],
};

beforeEach(() => workflowStore.getState().reset());

describe("WorkflowEditor", () => {
  it("ajoute un nœud depuis la palette", async () => {
    const { user } = renderEditor();
    expect(screen.getByText(/Ajoutez des nœuds depuis la palette/)).toBeInTheDocument();
    expect(screen.getByText("Enregistré")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajouter le nœud « Texte »" }));

    const node = await screen.findByRole("group", { name: "Nœud Texte" });
    expect(within(node).getByLabelText("Texte")).toBeInTheDocument();
    expect(workflowStore.getState().nodes).toHaveLength(1);
    expect(screen.getByText("Modifications non enregistrées")).toBeInTheDocument();
    // Le nœud ajouté est sélectionné : « Exécuter jusqu'ici » devient disponible.
    expect(screen.getByRole("button", { name: "Exécuter jusqu'ici" })).toBeEnabled();
  });

  it("exécute un graphe de deux nœuds avec une API simulée", async () => {
    const services = fakeServices();
    const media = makeMedia({ id: "m1", name: "photo.png" });
    services.media.list.mockResolvedValue([media]);
    services.media.get.mockResolvedValue(media);
    workflowStore.getState().load(LIBRARY_TO_OUTPUT, { id: null, name: "Essai" });
    const { user } = renderEditor(services);

    await user.click(screen.getByRole("button", { name: "Exécuter" }));

    const preview = await screen.findByRole("img", { name: "Aperçu : photo.png" });
    expect(preview).toHaveAttribute("src", media.content_url);
    expect(screen.getByRole("link", { name: "Ouvrir l'image" })).toHaveAttribute(
      "href",
      "/image/m1",
    );
    expect(screen.getAllByText("Terminé")).toHaveLength(2);
    expect(screen.getByText("Exécution terminée : 2 nœuds exécutés.")).toBeInTheDocument();
    expect(services.media.get).toHaveBeenCalledWith("m1");
  });

  it("affiche les erreurs de validation sans rien exécuter", async () => {
    const services = fakeServices();
    const { user } = renderEditor(services);
    await user.click(screen.getByRole("button", { name: "Ajouter le nœud « Sortie »" }));
    await user.click(screen.getByRole("button", { name: "Exécuter" }));

    expect(
      await screen.findByText("Le workflow n'est pas valide : rien n'a été exécuté."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("« Sortie » : l'entrée obligatoire « Média » n'est pas connectée."),
    ).not.toHaveLength(0);
    expect(services.media.get).not.toHaveBeenCalled();
  });

  it("enregistre un nouveau workflow via workflowApi.create", async () => {
    const services = fakeServices();
    services.workflows.create.mockImplementation(async (payload) =>
      makeWorkflow({ id: "wf-9", name: payload.name, graph: payload.graph }),
    );
    const { user } = renderEditor(services);
    await user.click(screen.getByRole("button", { name: "Ajouter le nœud « Texte »" }));

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    const dialog = await screen.findByRole("dialog", { name: "Enregistrer le workflow" });
    const input = within(dialog).getByLabelText("Nom du workflow");
    await user.clear(input);
    await user.type(input, "  Mon   flux ");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(services.workflows.create).toHaveBeenCalledTimes(1));
    expect(services.workflows.create).toHaveBeenCalledWith({
      name: "Mon flux",
      graph: {
        version: 1,
        nodes: [expect.objectContaining({ type: "text", data: { text: "" } })],
        edges: [],
      },
    });
    expect(await screen.findByText("Enregistré")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mon flux" })).toBeInTheDocument();
    expect(workflowStore.getState().workflowId).toBe("wf-9");

    // Un second enregistrement met à jour le même workflow.
    services.workflows.update.mockResolvedValue(makeWorkflow({ id: "wf-9", name: "Mon flux" }));
    workflowStore.getState().updateParams(workflowStore.getState().nodes[0]!.id, { text: "x" });
    await user.click(await screen.findByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(services.workflows.update).toHaveBeenCalledWith("wf-9", expect.anything()),
    );
  });

  it("charge un modèle", async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Modèles" }));
    const dialog = await screen.findByRole("dialog", { name: "Modèles de workflow" });
    await user.click(
      within(dialog).getByRole("button", {
        name: "Utiliser le modèle « Texte vers image puis vidéo »",
      }),
    );
    expect(await screen.findByRole("group", { name: "Nœud Texte vers image" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Nœud Image vers vidéo" })).toBeInTheDocument();
    expect(workflowStore.getState().edges).toHaveLength(3);
  });

  it("ouvre la liste des workflows et confirme la suppression", async () => {
    const services = fakeServices();
    const saved = makeWorkflow({ id: "wf-1", name: "Flux A", graph: { ...LIBRARY_TO_OUTPUT } });
    services.workflows.list.mockResolvedValue([saved]);
    services.workflows.get.mockResolvedValue(saved);
    services.workflows.remove.mockResolvedValue(undefined);
    services.media.list.mockResolvedValue([]);
    const { user } = renderEditor(services);

    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    const dialog = await screen.findByRole("dialog", { name: "Ouvrir un workflow" });
    await user.click(await within(dialog).findByRole("button", { name: "Supprimer « Flux A »" }));
    const confirm = await screen.findByRole("dialog", { name: "Supprimer le workflow ?" });
    await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(services.workflows.remove).toHaveBeenCalledWith("wf-1"));

    await user.click(within(dialog).getByRole("button", { name: "Ouvrir « Flux A »" }));
    expect(await screen.findByRole("heading", { name: "Flux A" })).toBeInTheDocument();
    expect(workflowStore.getState().nodes).toHaveLength(2);
    expect(screen.getByText("Enregistré")).toBeInTheDocument();
  });

  it("importe un fichier JSON", async () => {
    const { user } = renderEditor();
    const file = new File([JSON.stringify(LIBRARY_TO_OUTPUT)], "Mon import.json", {
      type: "application/json",
    });
    await user.upload(screen.getByLabelText("Fichier de workflow à importer"), file);
    expect(await screen.findByText("Workflow importé : 2 nœuds.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mon import" })).toBeInTheDocument();
    expect(workflowStore.getState().nodes.map((n) => n.id)).toEqual(["lib", "out"]);
  });

  it("utilise le média de l'Atelier fourni par l'hôte", async () => {
    const { user } = renderEditor(fakeServices(), fakeHost());
    await user.click(
      screen.getByRole("button", { name: "Ajouter le nœud « Média de l'Atelier »" }),
    );
    const node = await screen.findByRole("group", { name: "Nœud Média de l'Atelier" });
    expect(within(node).getByText("Média ouvert : clip.mp4")).toBeInTheDocument();
    expect(within(node).getByLabelText("Type attendu")).toHaveValue("video");
  });
});
