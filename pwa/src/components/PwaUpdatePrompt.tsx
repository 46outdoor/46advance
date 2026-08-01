import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** Fallback delay before force-reloading when no controllerchange arrives (see onReload). */
const RELOAD_FALLBACK_MS = 2000;

/**
 * User-controlled PWA update prompt. The service worker uses `registerType: 'prompt'`, so a new
 * build installs but WAITS — without this the user would run stale code indefinitely. When a new
 * SW is waiting, `onNeedRefresh` fires and we surface a small toast; "Reload" activates the new
 * SW and reloads. Rendered once, outside the router, in main.tsx.
 *
 * We own the reload instead of passing `reloadPage: true` to the library. Its reload is gated on
 * the workbox `controlling` event's `isUpdate` flag, which is false when the update was discovered
 * by ANOTHER tab (`isExternal`) — with several app tabs open, clicking Reload activated the new SW
 * and then visibly did nothing, and a second click no-oped because nothing was waiting anymore.
 * So: listen for `controllerchange` ourselves (fires regardless of which tab found the update),
 * send the skip-waiting message, and hard-reload after a short fallback if control never changes —
 * e.g. the new SW already took control while the toast sat open, where reloading is exactly right.
 */
export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [reloading, setReloading] = useState(false);
  const updateSW = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateSW.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
  }, []);

  if (!needRefresh) return null;

  const onReload = () => {
    if (reloading) return;
    setReloading(true);
    let done = false;
    const reloadOnce = () => {
      if (done) return;
      done = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true });
    window.setTimeout(reloadOnce, RELOAD_FALLBACK_MS);
    // `false`: we handle the reload above; the library only needs to message the waiting SW.
    void updateSW.current?.(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-ink px-4 py-3 text-surface shadow-lg"
    >
      <span className="text-sm">A new version of 46 Advance is available.</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={reloading}
          onClick={onReload}
          className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {reloading ? 'Reloading…' : 'Reload'}
        </button>
        <button
          type="button"
          disabled={reloading}
          onClick={() => setNeedRefresh(false)}
          className="rounded border border-surface/40 px-3 py-1.5 text-sm transition-colors hover:border-surface disabled:opacity-60"
        >
          Later
        </button>
      </div>
    </div>
  );
}
