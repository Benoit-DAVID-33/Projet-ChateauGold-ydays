import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { composePrompt } from "../prompt/compose";
import { IMAGE, shape } from "../test/factories";
import { usePromptComposition } from "./usePromptComposition";

describe("usePromptComposition", () => {
  it("renvoie composePrompt, mémoïsé tant que les entrées ne changent pas", () => {
    const elements = [shape()];
    const input = { intent: "Lueur", includeAnnotations: true, elements, mediaInfo: IMAGE };
    const { result, rerender } = renderHook((props) => usePromptComposition(props), {
      initialProps: input,
    });
    expect(result.current).toEqual(composePrompt(input));
    const first = result.current;

    rerender({ ...input });
    expect(result.current).toBe(first);

    rerender({ ...input, includeAnnotations: false });
    expect(result.current).not.toBe(first);
    expect(result.current.prompt).toBe("Lueur");
  });
});
