import { useState } from 'react';
import { captureError } from '@/lib/errorCapture';
import { isSentryActive } from '@/lib/sentry';

/**
 * Admin-only observability check (WS-I). Shows whether Sentry is active in THIS build and sends a
 * deliberate, production-SAFE test event — `captureError` reports without throwing, so nothing
 * breaks — so the pipeline (release correlation + source-map symbolication) can be verified in
 * Sentry Issues after the DSN is wired.
 */
export function ObservabilityDiagnostics() {
  const active = isSentryActive();
  const [sent, setSent] = useState(false);

  const sendTest = (): void => {
    const release = (import.meta.env.VITE_APP_RELEASE as string | undefined) ?? 'unknown';
    captureError(new Error(`Sentry verification test — release ${release} @ ${new Date().toISOString()}`), {
      source: 'AdminDiagnostics',
      test: true,
    });
    setSent(true);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold text-brand">Observability</h2>
      <div className="space-y-3 rounded-lg border border-line p-4">
        <p className="text-sm text-ink">
          Sentry error reporting is{' '}
          {active ? (
            <span className="font-semibold text-status-complete">active</span>
          ) : (
            <span className="font-semibold text-ink-muted">not configured</span>
          )}
          {active
            ? ' — unhandled errors and logged failures in this build are sent to Sentry.'
            : ' — set VITE_SENTRY_DSN in the production build to activate (see guides/OBSERVABILITY.md).'}
        </p>
        <button
          type="button"
          onClick={sendTest}
          disabled={!active}
          className="rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Send a test event
        </button>
        {sent && (
          <p className="text-sm text-ink-muted">
            Test event sent — check <span className="font-medium text-ink">Issues</span> in Sentry (it can take a few
            seconds to appear).
          </p>
        )}
      </div>
    </div>
  );
}
