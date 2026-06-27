/**
 * Sentry integration. Activates only when `VITE_SENTRY_DSN` is set (build/runtime
 * env), so it stays a no-op in dev / un-configured environments.
 *
 * Two bridges, deliberately split to avoid double-reporting:
 *  - the logger sink forwards every log line to Sentry as a *breadcrumb*
 *    (the trail leading up to an error);
 *  - `captureExceptionToSentry` (called by `errorCapture.captureError`) is the
 *    single path that creates a Sentry *event*. So a captured error becomes one
 *    event with its own log line in the breadcrumb trail — not two events.
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

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_RELEASE as string | undefined,
    sendDefaultPii: false,
  });
  initialized = true;

  setGlobalLogSink((level, namespace, message, detail) => {
    Sentry.addBreadcrumb({
      category: namespace,
      level: breadcrumbLevel[level],
      message,
      data: detail === undefined ? undefined : { detail },
    });
  });
}

export function captureExceptionToSentry(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
