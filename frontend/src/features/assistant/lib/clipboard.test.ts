import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyText } from "./clipboard";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

function setExecCommand(value: unknown) {
  Object.defineProperty(document, "execCommand", { value, configurable: true, writable: true });
}

beforeEach(() => {
  setClipboard(undefined);
  setExecCommand(undefined);
});

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
  else Reflect.deleteProperty(document, "execCommand");
  document.body.innerHTML = "";
});

describe("copyText", () => {
  it("utilise l'API Clipboard asynchrone et attend son résultat", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(copyText("bonjour")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("bonjour");
  });

  it("se replie sur execCommand quand l'API est refusée", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    let copied = "";
    const execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement | null)?.value ?? "";
      return true;
    });
    setExecCommand(execCommand);

    await expect(copyText("repli")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copied).toBe("repli");
    expect(document.querySelector("textarea")).toBeNull(); // zone temporaire retirée
  });

  it("insère la zone temporaire dans la modale qui a le focus, puis rend le focus", async () => {
    const dialog = document.createElement("dialog");
    dialog.open = true;
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    button.focus();

    let host: Element | null = null;
    setExecCommand(
      vi.fn(() => {
        host = document.querySelector("textarea")?.parentElement ?? null;
        return true;
      }),
    );

    await expect(copyText("json")).resolves.toBe(true);
    expect(host).toBe(dialog);
    expect(document.activeElement).toBe(button);
  });

  it("renvoie false quand aucune méthode ne fonctionne", async () => {
    await expect(copyText("x")).resolves.toBe(false);
    setExecCommand(
      vi.fn(() => {
        throw new Error("unsupported");
      }),
    );
    await expect(copyText("x")).resolves.toBe(false);
    setExecCommand(vi.fn(() => false));
    await expect(copyText("x")).resolves.toBe(false);
  });
});
