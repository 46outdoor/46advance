import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * User-controlled PWA update prompt. The service worker uses `registerType: 'prompt'`, so a new
 * build installs but WAITS — without this the user would run stale code indefinitely. When a new
 * SW is waiting, `onNeedRefresh` fires and we surface a small toast; "Reload" activates the new
 * SW and reloads. Rendered once, outside the router, in main.tsx.
 */
export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSW = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateSW.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
  }, []);

  if (!needRefresh) return null;

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
          onClick={() => void updateSW.current?.(true)}
          className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded border border-surface/40 px-3 py-1.5 text-sm transition-colors hover:border-surface"
        >
          Later
        </button>
      </div>
    </div>
  );
}
