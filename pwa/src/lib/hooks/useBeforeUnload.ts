import { useEffect } from 'react';

/**
 * Warn before a HARD page unload (tab close / reload / browser exit) while `active` is true —
 * e.g. during an in-flight upload whose completion would otherwise be abandoned mid-flight,
 * stranding a just-created Drive file with no app record. In-app (SPA) navigation is unaffected:
 * React Query lets the mutation run to completion detached, so only a hard teardown loses it.
 */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require returnValue to be set to trigger the native prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
