import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadTextFile } from "./download";

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("downloadTextFile", () => {
  it("télécharge le contenu via un Blob, un lien temporaire et une URL révoquée", async () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(document.body.contains(this)).toBe(true); // attaché au moment du clic
    });

    downloadTextFile('{"a":1}', "elements_1.json");

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe('{"a":1}');

    expect(click).toHaveBeenCalledTimes(1);
    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(clicked.download).toBe("elements_1.json");
    expect(clicked.getAttribute("href")).toBe("blob:mock-url");
    expect(document.body.contains(clicked)).toBe(false); // lien retiré

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
