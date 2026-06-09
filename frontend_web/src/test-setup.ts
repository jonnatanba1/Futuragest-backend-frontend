import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mantine relies on matchMedia (color scheme) and ResizeObserver, neither of
// which jsdom implements. Provide minimal stubs for component tests.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom doesn't implement scrollIntoView (used by some Mantine overlays).
window.HTMLElement.prototype.scrollIntoView ??= vi.fn();
