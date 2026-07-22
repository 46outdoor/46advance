/**
 * Sentry integration. Activates only when `VITE_SENTRY_DSN` is set (build/runtime env), so it
 * stays a no-op in dev / un-configured environments — the whole feature is inert until the DSN
 * (and, for readable stacks, the source-map upload token) are provisioned.
 *
 * The logger sink is the single bridge to the SDK:
 *  - EVERY log line is added as a *breadcrumb* (the trail leading up to an error);
 *  - an ERROR line additionally becomes a Sentry *event*, so a routine `logger.error(...)` —
 *    a mutation or background failure — creates an incident, not just a breadcrumb (F-12).
 *
 * `captureError` (errorCapture.ts) routes through `logger.error`, so a captured error becomes
 * exactly one event with its own line in the breadcrumb trail — never two (no double-report from
 * React error boundaries).
 */
import * as Sentry from '@sentry/react';
import { setGlobalLogSink, type LogLevel } from './logger';

let initialized = false;

const breadcrumbLevel: Record<LogLevel, 'debug' | 'info' | 'warning' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
};

/** The Error inside a log detail — the raw detail, or the `{ error }` wrapper captureError uses. */
function errorFromDetail(detail: unknown): Error | null {
  if (detail instanceof Error) return detail;
  if (detail && typeof detail === 'object' && (detail as { error?: unknown }).error instanceof Error) {
    return (detail as { error: Error }).error;
  }
  return null;
}

/** Structured context for the event's `extra`, minus the Error itself (it's the exception). */
function detailExtra(detail: unknown): Record<string, unknown> | undefined {
  if (detail && typeof detail === 'object') {
    const rest = { ...(detail as Record<string, unknown>) };
    delete rest.error;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  return detail === undefined ? undefined : { detail };
}

/** Whether Sentry initialized (a DSN was present at startup). The admin diagnostics reads this to
 *  show status and to keep a test event meaningful (it would otherwise be a silent no-op). */
export function isSentryActive(): boolean {
  return initialized;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_RELEASE as string | undefined,
    sendDefaultPii: false, // never attach IPs / request bodies (F-12: no sensitive data)
  });
  initialized = true;

  setGlobalLogSink((level, namespace, message, detail) => {
    Sentry.addBreadcrumb({
      category: namespace,
      level: breadcrumbLevel[level],
      message,
      data: detail === undefined ? undefined : { detail },
    });
    if (level !== 'error') return;
    const err = errorFromDetail(detail);
    const extra = detailExtra(detail);
    if (err) {
      Sentry.captureException(err, extra ? { extra } : undefined);
    } else {
      Sentry.captureMessage(`[${namespace}] ${message}`, extra ? { level: 'error', extra } : { level: 'error' });
    }
  });
}
