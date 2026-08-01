import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

/**
 * Regression: clicking Reload visibly did nothing. The library's own reload is gated on the
 * workbox `controlling` event's `isUpdate` flag, which is false when the update was discovered by
 * ANOTHER tab — the click activated the new SW and then just sat there. The component now owns the
 * reload: a one-shot `controllerchange` listener plus a hard fallback timer.
 */

// virtual:pwa-register is a build-time module; capture what the component passes it.
const updateSW = vi.fn(() => Promise.resolve());
let fireNeedRefresh: () => void = () => {};
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onNeedRefresh?: () => void }) => {
    fireNeedRefresh = () => opts.onNeedRefresh?.();
    return updateSW;
  },
}));

const reload = vi.fn();
let fireControllerChange: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  updateSW.mockClear();
  reload.mockClear();
  fireControllerChange = null;

  // jsdom has neither navigator.serviceWorker nor a stubbable location.reload.
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (type: string, cb: () => void) => {
        if (type === 'controllerchange') fireControllerChange = cb;
      },
    },
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function showPrompt() {
  render(<PwaUpdatePrompt />);
  expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  act(() => fireNeedRefresh());
  expect(screen.getByText(/new version/i)).toBeInTheDocument();
}

describe('PwaUpdatePrompt', () => {
  it('reloads when the new service worker takes control, regardless of which tab found it', () => {
    showPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    // We message the waiting SW but own the reload ourselves (reloadPage: false).
    expect(updateSW).toHaveBeenCalledWith(false);
    expect(reload).not.toHaveBeenCalled();

    act(() => fireControllerChange?.());
    expect(reload).toHaveBeenCalledTimes(1);

    // The fallback timer must not fire a second reload.
    act(() => vi.advanceTimersByTime(5000));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  /** The stuck case: control never changes (e.g. the new SW already took over while the toast sat
   *  open, so nothing is waiting). The fallback makes the click always do SOMETHING. */
  it('hard-reloads after the fallback delay when controllerchange never fires', () => {
    showPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    act(() => vi.advanceTimersByTime(1999));
    expect(reload).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows a reloading state and ignores repeat clicks', () => {
    showPrompt();
    const button = screen.getByRole('button', { name: 'Reload' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Reloading…' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reloading…' }));
    expect(updateSW).toHaveBeenCalledTimes(1);
  });

  it('Later dismisses without touching the service worker', () => {
    showPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
    expect(updateSW).not.toHaveBeenCalled();
  });
});
