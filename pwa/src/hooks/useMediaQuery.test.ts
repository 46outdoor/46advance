/**
 * `src/testing/setup.ts` installs a jsdom `matchMedia` shim only when the property is missing,
 * and that shim is deliberately inert: it always reports `matches: false` and its
 * `addEventListener` is a `vi.fn()` that records the listener and never calls it.
 *
 * That default is the right one for the app (mobile-first: `false` = the narrow presentation),
 * but it cannot express a *change*. Every test here therefore installs its own controllable
 * stub — mutable `matches`, real listener bookkeeping — which is the only way to simulate
 * crossing a breakpoint in jsdom.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

const QUERY = '(min-width: 800px)';

type ChangeListener = (event: MediaQueryListEvent) => void;

const media = {
  matches: false,
  listeners: new Set<ChangeListener>(),
  queries: [] as string[],
};

/** Replace `window.matchMedia` with a stub that actually notifies its `change` listeners. */
function installMatchMedia() {
  media.matches = false;
  media.listeners = new Set();
  media.queries = [];
  window.matchMedia = vi.fn((query: string) => {
    media.queries.push(query);
    const list = {
      get matches() {
        return media.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => {
        media.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: ChangeListener) => {
        media.listeners.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    return list as unknown as MediaQueryList;
  });
}

/** Change the viewport and fire `change`, the way a real resize would. */
function crossBreakpoint(matches: boolean) {
  media.matches = matches;
  act(() => {
    for (const listener of [...media.listeners]) listener({ matches } as MediaQueryListEvent);
  });
}

beforeEach(() => {
  installMatchMedia();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('reports the query state on the very first render, before any effect runs', () => {
    media.matches = true;
    const { result } = renderHook(() => useMediaQuery(QUERY));

    // Seeded from a lazy useState initializer, not from the effect: a first paint at the wrong
    // breakpoint would flash the wrong navigation.
    expect(result.current).toBe(true);
    expect(media.queries).toContain(QUERY);
  });

  it('reports false when the query does not match', () => {
    const { result } = renderHook(() => useMediaQuery(QUERY));

    expect(result.current).toBe(false);
  });

  it('updates when the media query changes', () => {
    const { result } = renderHook(() => useMediaQuery(QUERY));
    expect(result.current).toBe(false);

    crossBreakpoint(true);
    expect(result.current).toBe(true);

    crossBreakpoint(false);
    expect(result.current).toBe(false);
  });

  it('re-syncs on subscribe when the query itself changes', () => {
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 800px)' },
    });
    expect(result.current).toBe(false);

    // Silently true — no `change` event. Only the effect re-running for the new query can catch
    // this, which is exactly the case a subscribe-without-resync implementation gets wrong.
    media.matches = true;
    rerender({ query: '(min-width: 1200px)' });

    expect(result.current).toBe(true);
    expect(media.queries).toContain('(min-width: 1200px)');
  });

  it('drops the previous subscription when the query changes', () => {
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 800px)' },
    });
    expect(media.listeners.size).toBe(1);

    rerender({ query: '(min-width: 1200px)' });

    expect(media.listeners.size).toBe(1);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery(QUERY));
    expect(media.listeners.size).toBe(1);

    unmount();

    expect(media.listeners.size).toBe(0);
  });

  it('reports false and never subscribes where matchMedia does not exist (SSR, old jsdom)', () => {
    // `delete` would only unmask jsdom's own `Window.prototype.matchMedia`; shadow it instead.
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { result, unmount } = renderHook(() => useMediaQuery(QUERY));

    expect(result.current).toBe(false);
    // Unmount must stay safe too — there is nothing to unsubscribe from.
    expect(() => unmount()).not.toThrow();
  });
});
