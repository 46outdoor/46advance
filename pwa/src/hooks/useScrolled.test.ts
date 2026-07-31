import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScrolled } from './useScrolled';

/**
 * Regression: the header flickered rapidly on a small scroll. It is `sticky top-0`, so it occupies
 * flow space; collapsing made the document ~40px shorter, the browser reduced `window.scrollY` to
 * match, and with a single 8px threshold that dropped scroll back under the threshold — expanding
 * the header, which pushed scrollY over it again, every frame.
 *
 * The fix is hysteresis, so these tests assert the *gap* behaves, not just the two edges.
 */
/**
 * Pending rAF callback. The stub must defer like the real thing: running the callback synchronously
 * would let it clear the hook's frame handle *before* `requestAnimationFrame` returned the id,
 * latching the coalescing guard shut forever — an artifact of the stub, not of the hook.
 */
let pendingFrame: FrameRequestCallback | null = null;

function flushFrame() {
  const cb = pendingFrame;
  pendingFrame = null;
  if (cb) act(() => cb(0));
}

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
  flushFrame();
}

beforeEach(() => {
  pendingFrame = null;
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pendingFrame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useScrolled', () => {
  it('starts unscrolled at the top', () => {
    const { result } = renderHook(() => useScrolled());
    expect(result.current).toBe(false);
  });

  it('does not shrink until the enter threshold is passed', () => {
    const { result } = renderHook(() => useScrolled(64, 16));
    scrollTo(40); // past the old 8px trigger, but below enter
    expect(result.current).toBe(false);
    scrollTo(65);
    expect(result.current).toBe(true);
  });

  /**
   * The actual bug. Collapsing the header shortens the document, so the browser pulls scrollY down
   * by roughly the collapse height. That rebound must NOT expand the header again.
   */
  it('stays shrunk when the collapse itself rebounds scrollY (no flicker)', () => {
    const { result } = renderHook(() => useScrolled(64, 16));
    scrollTo(65);
    expect(result.current).toBe(true);

    scrollTo(25); // 65 minus the ~40px the header just gave back
    expect(result.current).toBe(true); // would have flipped false with a single 8px threshold
  });

  it('expands again only below the exit threshold, and does not immediately re-shrink', () => {
    const { result } = renderHook(() => useScrolled(64, 16));
    scrollTo(65);
    scrollTo(10);
    expect(result.current).toBe(false);

    scrollTo(56); // the ~40px the header just reclaimed — still under enter
    expect(result.current).toBe(false);
  });

  it('holds its current state anywhere between the thresholds', () => {
    const { result } = renderHook(() => useScrolled(64, 16));
    scrollTo(40);
    expect(result.current).toBe(false); // was expanded → stays expanded

    scrollTo(65);
    scrollTo(40);
    expect(result.current).toBe(true); // was shrunk → stays shrunk at the same offset
  });

  // Scroll fires far more often than the page can paint; a burst must schedule exactly one read.
  it('coalesces a burst of scroll events into a single frame', () => {
    const raf = vi.fn((cb: FrameRequestCallback) => {
      pendingFrame = cb;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    renderHook(() => useScrolled());
    raf.mockClear();

    act(() => {
      for (let i = 0; i < 5; i += 1) window.dispatchEvent(new Event('scroll'));
    });
    expect(raf).toHaveBeenCalledTimes(1);

    // Once the frame runs, the next burst schedules again.
    flushFrame();
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('removes its listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useScrolled());
    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    remove.mockRestore();
  });
});
