import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '@/lib/errorCapture';
import { isDynamicImportError, recoverFromStaleChunk } from '@/lib/pwa/recovery';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  /** The error was a stale post-deploy chunk — we're auto-reloading, not showing a hard error. */
  recovering: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, recovering: isDynamicImportError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isDynamicImportError(error)) {
      // A lazy route failed to load its chunk after a deploy — clear caches + SW and reload.
      void recoverFromStaleChunk();
      return;
    }
    captureError(error, { source: 'AppErrorBoundary', componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.recovering) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand p-6 text-center text-brand-fg">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-fg/30 border-t-accent" />
          <p className="text-sm opacity-80">Updating to the latest version…</p>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand p-6 text-center text-brand-fg">
          <p className="font-display text-2xl font-bold">Something went wrong</p>
          <p className="text-sm opacity-80">The app hit an unexpected error.</p>
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
