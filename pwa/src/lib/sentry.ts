/**
 * Sentry integration — STUBBED for Phase 0. No-op until a Sentry project/DSN exists
 * (tracked in planning/ROADMAP.md § Observability). When wired, `initSentry()` will
 * initialize @sentry/react and route the logger sink to Sentry.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return; // no-op until a DSN is configured
  // TODO(observability): init @sentry/react, then setGlobalLogSink(...) from logger.ts.
}

export function captureExceptionToSentry(
  _error: unknown,
  _context?: Record<string, unknown>,
): void {
  // no-op until Sentry is wired
}
