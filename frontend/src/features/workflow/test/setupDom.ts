/**
 * Compléments jsdom nécessaires à React Flow (ResizeObserver, DOMMatrixReadOnly,
 * dimensions des éléments). À importer en tête des tests de composants.
 */

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const element = target as HTMLElement;
    const contentRect = { x: 0, y: 0, width: element.offsetWidth, height: element.offsetHeight };
    this.callback(
      [{ target, contentRect } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  readonly m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

const globals = globalThis as Record<string, unknown>;
globals.ResizeObserver ??= ResizeObserverStub;
globals.DOMMatrixReadOnly ??= DOMMatrixReadOnlyStub;

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: {
    configurable: true,
    get(this: HTMLElement) {
      return parseFloat(this.style.height) || 1;
    },
  },
  offsetWidth: {
    configurable: true,
    get(this: HTMLElement) {
      return parseFloat(this.style.width) || 1;
    },
  },
});

(SVGElement.prototype as unknown as { getBBox(): DOMRect }).getBBox = () =>
  ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;

export {};
