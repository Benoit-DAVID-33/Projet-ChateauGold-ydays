import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTransientFeedback } from "./useTransientFeedback";

afterEach(() => {
  vi.useRealTimers();
});

describe("useTransientFeedback", () => {
  it("efface la confirmation après le délai, et l'erreur après le double", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientFeedback(1000));

    act(() => result.current.show({ tone: "success", text: "Copié" }));
    expect(result.current.feedback).toEqual({ tone: "success", text: "Copié" });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.feedback).toBeNull();

    act(() => result.current.show({ tone: "error", text: "Échec" }));
    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.feedback?.text).toBe("Échec");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.feedback).toBeNull();
  });

  it("remplace le message précédent et relance le délai", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientFeedback(1000));
    act(() => result.current.show({ tone: "success", text: "A" }));
    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.show({ tone: "success", text: "B" }));
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.feedback?.text).toBe("B");
  });

  it("annule le minuteur au démontage", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTransientFeedback(1000));
    act(() => result.current.show({ tone: "success", text: "A" }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
