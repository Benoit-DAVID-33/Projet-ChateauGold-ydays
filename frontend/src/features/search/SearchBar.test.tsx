import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "./SearchBar";

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => {
    FakeRecognition.last = this;
  });
  stop = vi.fn(() => this.onend?.());
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe("SearchBar", () => {
  it("envoie la requête saisie (Entrée)", async () => {
    const onSubmit = vi.fn();
    render(<SearchBar onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Requête"), "  ajoute des étincelles{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("ajoute des étincelles");
  });

  it("Entrée lance la recherche, ENVOYER l'envoi (comportement v1)", async () => {
    const onSubmit = vi.fn();
    const onSearch = vi.fn();
    render(<SearchBar onSubmit={onSubmit} onSearch={onSearch} />);
    await userEvent.type(screen.getByLabelText("Requête"), "paillettes{Enter}");
    expect(onSearch).toHaveBeenCalledWith("paillettes");
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "ENVOYER" }));
    expect(onSubmit).toHaveBeenCalledWith("paillettes");
  });

  it("explique l'absence de support de la dictée au lieu de cacher le micro", async () => {
    render(<SearchBar onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /dicter au micro/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/pas supportée/i);
  });

  it("ajoute les résultats vocaux définitifs (fr-FR, continu)", async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    render(<SearchBar onSubmit={vi.fn()} initialValue="bonjour" />);
    await userEvent.click(screen.getByRole("button", { name: /dicter au micro/i }));
    const recognition = FakeRecognition.last!;
    expect(recognition.lang).toBe("fr-FR");
    expect(recognition.continuous).toBe(true);
    expect(screen.getByText(/écoute en cours/i)).toBeInTheDocument();

    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [
          { isFinal: false, 0: { transcript: "provisoire" } },
          { isFinal: true, 0: { transcript: "monde doré" } },
        ],
      });
    });
    expect(screen.getByLabelText("Requête")).toHaveValue("bonjour monde doré");

    act(() => recognition.onerror?.({ error: "no-speech" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // silence ignoré, comme en v1

    act(() => recognition.onerror?.({ error: "not-allowed" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/microphone refusé/i);
  });
});
