import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '@/lib/errorCapture';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { source: 'AppErrorBoundary', componentStack: info.componentStack });
  }

  render(): ReactNode {
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
