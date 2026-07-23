import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { captureError } from '@/lib/errorCapture';
import { isDynamicImportError, recoverFromStaleChunk } from '@/lib/pwa/recovery';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Error boundary scoped to the routed content area. A crash in one screen shows a contained
 * message (the app shell/nav stay usable) instead of blanking the whole app like the top-level
 * boundary would. A stale post-deploy chunk still triggers the self-heal.
 */
class Boundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isDynamicImportError(error)) {
      void recoverFromStaleChunk();
      return;
    }
    captureError(error, { source: 'RouteErrorBoundary', componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-display text-lg font-bold text-brand">This page ran into a problem</p>
          <p className="text-sm text-ink-muted">
            Try reloading. Other pages are still available from the menu.
          </p>
          <button
            type="button"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Keyed by pathname so navigating away from a crashed route clears the error automatically. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
