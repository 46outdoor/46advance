import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement matchMedia; default to "system = light" so code that reads
// `prefers-color-scheme` (e.g. ThemeProvider) works in tests. Override per-test as needed.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
