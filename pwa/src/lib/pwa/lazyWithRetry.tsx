import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isDynamicImportError, recoverFromStaleChunk } from './recovery';

/**
 * `React.lazy` hardened against stale dynamically-imported chunks after a deploy. Retries the
 * import once (covers a transient network blip), and if it still fails with a chunk-load error,
 * kicks off the self-heal (clear caches + service worker, reload) and rethrows so the error
 * boundary shows a fallback until the reload lands. Non-chunk errors propagate unchanged.
 */
export function lazyWithRetry<T extends ComponentType<Record<string, never>>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isDynamicImportError(err)) throw err;
      try {
        return await factory(); // one retry
      } catch (retryErr) {
        if (isDynamicImportError(retryErr)) void recoverFromStaleChunk();
        throw retryErr;
      }
    }
  });
}
