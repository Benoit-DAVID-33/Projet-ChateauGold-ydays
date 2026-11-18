import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnnotationElement, MediaInfo } from "@/features/editor/model/types";

import { composePrompt } from "../prompt/compose";
import { IMAGE, VIDEO, line, shape, text } from "../test/factories";
import { forbiddenSymbol, visibleText } from "../test/symbols";
import { PromptComposer } from "./PromptComposer";

const ELEMENTS: AnnotationElement[] = [shape(), text({ startTime: 1, endTime: 4 }), line()];

interface HarnessProps {
  elements?: AnnotationElement[];
  mediaInfo?: MediaInfo | null;
  initialIntent?: string;
  initialNegative?: string;
  initialInclude?: boolean;
  className?: string;
}

/** Page minimale : l'Atelier contrôle les valeurs du bloc Prompt. */
function setup({
  elements = ELEMENTS,
  mediaInfo = VIDEO,
  initialIntent = "",
  initialNegative = "",
  initialInclude = true,
  className,
}: HarnessProps = {}) {
  const user = userEvent.setup();
  const spies = {
    onIntentChange: vi.fn<(v: string) => void>(),
    onNegativePromptChange: vi.fn<(v: string) => void>(),
    onIncludeAnnotationsChange: vi.fn<(v: boolean) => void>(),
  };
  function Harness() {
    const [intent, setIntent] = useState(initialIntent);
    const [negative, setNegative] = useState(initialNegative);
    const [include, setInclude] = useState(initialInclude);
    return (
      <PromptComposer
        intent={intent}
        onIntentChange={(v) => {
          setIntent(v);
          spies.onIntentChange(v);
        }}
        negativePrompt={negative}
        onNegativePromptChange={(v) => {
          setNegative(v);
          spies.onNegativePromptChange(v);
        }}
        includeAnnotations={include}
        onIncludeAnnotationsChange={(v) => {
          setInclude(v);
          spies.onIncludeAnnotationsChange(v);
        }}
        elements={elements}
        mediaInfo={mediaInfo}
        className={className}
      />
    );
  }
  render(<Harness />);
  return { user, ...spies };
}

const promptField = () => screen.getByRole("textbox", { name: "Prompt" });
const negativeField = () => screen.getByRole("textbox", { name: "Prompt négatif" });
const annotationsBox = () => screen.getByRole("checkbox", { name: /Inclure les annotations/ });
const previewToggle = () => screen.getByRole("button", { name: "Aperçu du prompt final" });

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "scrollHeight",
);

afterEach(() => {
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  if (originalScrollHeight) {
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", originalScrollHeight);
  }
});

describe("PromptComposer — champs", () => {
  it("affiche le bloc Prompt façon SD WebUI", () => {
    setup({ className: "atelier-colonne" });
    expect(screen.getByRole("region", { name: "Composition du prompt" })).toHaveClass(
      "atelier-colonne",
    );
    expect(promptField()).toHaveValue("");
    expect(negativeField()).toHaveAttribute("maxlength", "2500");
    expect(annotationsBox()).toBeChecked();
    expect(annotationsBox()).toBeEnabled();
    expect(screen.getByText("Inclure les annotations (3 éléments)")).toBeInTheDocument();
    expect(screen.getByText("3 éléments : 1 forme, 1 texte, 1 ligne")).toBeInTheDocument();
    expect(previewToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Aperçu du prompt final" })).toBeNull();
  });

  it("remonte la saisie du prompt et du prompt négatif", async () => {
    const { user, onIntentChange, onNegativePromptChange } = setup();
    await user.type(promptField(), "Lueur");
    expect(onIntentChange).toHaveBeenLastCalledWith("Lueur");
    expect(promptField()).toHaveValue("Lueur");
    await user.type(negativeField(), "flou");
    expect(onNegativePromptChange).toHaveBeenLastCalledWith("flou");
    expect(screen.getByText("4 / 2500 caractères")).toBeInTheDocument();
  });

  it("compte les caractères du prompt réellement envoyé", async () => {
    const { user } = setup();
    await user.type(promptField(), "Lueur");
    const { length } = composePrompt({
      intent: "Lueur",
      includeAnnotations: true,
      elements: ELEMENTS,
      mediaInfo: VIDEO,
    });
    expect(promptField()).toHaveAccessibleDescription(
      `${length} / 2500 caractères, annotations comprises`,
    );

    await user.click(annotationsBox());
    expect(promptField()).toHaveAccessibleDescription("5 / 2500 caractères");
  });

  it("remonte la case « Inclure les annotations »", async () => {
    const { user, onIncludeAnnotationsChange } = setup();
    await user.click(annotationsBox());
    expect(onIncludeAnnotationsChange).toHaveBeenLastCalledWith(false);
    expect(annotationsBox()).not.toBeChecked();
  });

  it("désactive la case sans annotation visible", () => {
    setup({ elements: [shape({ startTime: 2, endTime: 2 })] });
    expect(annotationsBox()).toBeDisabled();
    expect(annotationsBox()).not.toBeChecked();
    expect(screen.getByText("Inclure les annotations (0 élément)")).toBeInTheDocument();
    expect(
      screen.getByText("Aucune annotation visible (1 ignoré, jamais visible)"),
    ).toBeInTheDocument();
  });
});

describe("PromptComposer — limite de 2500 caractères", () => {
  it("avertit clairement quand le prompt seul est trop long", () => {
    setup({ elements: [], initialIntent: "a".repeat(2501) });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Le prompt envoyé fait 2501 caractères, au-delà de la limite de 2500. Raccourcissez le prompt.",
    );
    expect(promptField()).toHaveAttribute("aria-invalid", "true");
  });

  it("propose de retirer les annotations quand elles font dépasser la limite", async () => {
    const { user } = setup({ initialIntent: "a".repeat(2400) });
    expect(screen.getByRole("alert")).toHaveTextContent(/décochez « Inclure les annotations »/);
    await user.click(annotationsBox());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(promptField()).not.toHaveAttribute("aria-invalid");
  });
});

describe("PromptComposer — aperçu repliable", () => {
  it("montre le prompt envoyé puis le prompt complet anglais", async () => {
    const { user } = setup({ initialIntent: "Lueur" });
    await user.click(previewToggle());
    expect(previewToggle()).toHaveAttribute("aria-expanded", "true");

    const region = screen.getByRole("region", { name: "Aperçu du prompt final" });
    const preview = within(region).getByRole("textbox", { name: "Aperçu du prompt final" });
    const composition = composePrompt({
      intent: "Lueur",
      includeAnnotations: true,
      elements: ELEMENTS,
      mediaInfo: VIDEO,
    });
    expect(preview).toHaveValue(composition.prompt);
    expect(within(region).getByText(/transmis tel quel par « Générer »/)).toBeInTheDocument();

    await user.click(within(region).getByRole("radio", { name: "Prompt complet (EN)" }));
    expect(preview).toHaveValue(composition.fullPrompt);

    await user.click(previewToggle());
    expect(screen.queryByRole("region", { name: "Aperçu du prompt final" })).toBeNull();
  });

  it("suit la case « Inclure les annotations » et copie le texte affiché", async () => {
    const { user } = setup({ initialIntent: " Lueur " });
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(previewToggle());
    await user.click(annotationsBox());
    const preview = screen.getByRole("textbox", { name: "Aperçu du prompt final" });
    expect(preview).toHaveValue("Lueur");

    await user.click(screen.getByRole("button", { name: "Copier" }));
    expect(writeText).toHaveBeenCalledWith("Lueur");
    expect(await screen.findByText("Prompt copié dans le presse-papiers.")).toBeInTheDocument();
  });

  it("télécharge un JSON dont les prompts reflètent la composition", async () => {
    const { user } = setup({ initialIntent: "Lueur", initialInclude: false, mediaInfo: IMAGE });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:composer");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await user.click(previewToggle());
    await user.click(screen.getByRole("button", { name: "Télécharger JSON" }));

    const data = JSON.parse(await createObjectURL.mock.calls[0]![0].text());
    expect(data).toMatchObject({ version: 2, userIntent: "Lueur", prompts: { send: "Lueur" } });
    expect(data.elements).toHaveLength(3);
  });

  it("ouvre et ferme la modale « Données JSON »", async () => {
    const { user } = setup({ initialIntent: "Lueur" });
    await user.click(previewToggle());
    await user.click(screen.getByRole("button", { name: "Voir JSON" }));

    const dialog = screen.getByRole("dialog", { name: "Données JSON" });
    const json = (within(dialog).getByRole("textbox") as HTMLTextAreaElement).value;
    expect(JSON.parse(json)).toMatchObject({ summary: { totalElements: 3 } });

    await user.click(within(dialog).getAllByRole("button", { name: "Fermer" }).at(-1)!);
    expect(screen.queryByRole("dialog", { name: "Données JSON" })).toBeNull();
  });
});

describe("PromptComposer — hauteur automatique", () => {
  it("adapte la hauteur du prompt à son contenu, puis défile au-delà du maximum", async () => {
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return this.value.length > 20 ? 900 : 120;
      },
    });
    const { user } = setup();
    expect(promptField().style.height).toBe("120px");
    expect(promptField().style.overflowY).toBe("hidden");

    await user.type(promptField(), "Un prompt beaucoup plus long");
    expect(promptField().style.height).toBe("360px");
    expect(promptField().style.overflowY).toBe("auto");
  });
});

describe("PromptComposer — aucun symbole décoratif", () => {
  it("n'affiche ni emoji ni symbole, aperçu et modale ouverts", async () => {
    const { user } = setup({ initialIntent: "Lueur" });
    await user.click(previewToggle());
    await user.click(screen.getByRole("radio", { name: "Prompt complet (EN)" }));
    expect(forbiddenSymbol(visibleText())).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Prompt envoyé" }));
    await user.click(screen.getByRole("button", { name: "Voir JSON" }));
    expect(forbiddenSymbol(visibleText())).toBeNull();
  });
});
