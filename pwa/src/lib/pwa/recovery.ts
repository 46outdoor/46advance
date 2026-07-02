/**
 * Stale-chunk recovery for the PWA. After a deploy, the browser may hold an old index that
 * points at hashed chunk filenames that no longer exist, so a lazy route import 404s with a
 * "Failed to fetch dynamically imported module" error. The fix: drop the caches + service
 * worker that pinned the old build and hard-reload to fetch the fresh index.
 *
 * Used by the layered recovery: the lazy-import retry wrapper, the app error boundary, and the
 * inline handler in index.html (which duplicates the essentials since it runs before modules
 * load). All three share the `pwa:last-recovery` cooldown key so they can't reload-loop.
 */
import { createLogger } from '@/lib/logger';

const logger = createLogger('PWA');

const DYNAMIC_IMPORT_ERROR =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module/i;

/** True when an error looks like a stale/missing dynamically-imported chunk (post-deploy). */
export function isDynamicImportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return DYNAMIC_IMPORT_ERROR.test(msg);
}

const RECOVERY_KEY = 'pwa:last-recovery';
const RECOVERY_COOLDOWN_MS = 20_000;

/** Recently recovered? Guards every recovery path against an infinite reload loop. */
function recentlyRecovered(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) ?? 0);
    if (Date.now() - last < RECOVERY_COOLDOWN_MS) return true;
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode/quota) — proceed without the guard.
  }
  return false;
}

/**
 * Clear Workbox caches + unregister service workers, then hard-reload — once per cooldown.
 * Deliberately does NOT wipe IndexedDB: that holds the Firebase auth session and Firestore
 * offline cache, and a stale *code* chunk is fixed by refreshing caches + SW alone.
 */
export async function recoverFromStaleChunk(): Promise<void> {
  if (recentlyRecovered()) {
    logger.warn('Stale-chunk recovery skipped (cooldown) — avoiding a reload loop');
    return;
  }
  logger.info('Recovering from a stale chunk: clearing caches + service workers, then reloading');
  try {
    if ('caches' in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // best-effort
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // best-effort
  }
  window.location.reload();
}
