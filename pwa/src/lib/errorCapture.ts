/**
 * Canonical error reporting. Route all caught errors through `captureError`
 * (see AGENTS.md / .claude/rules/security.md).
 *
 * captureError funnels through the logger, whose Sentry sink (lib/sentry.ts) turns an
 * error-level line into exactly ONE Sentry event — so the logger stays the single place that
 * knows about the SDK, and there is no double-report when a React error boundary also calls
 * captureError.
 */
import { createLogger } from '@/lib/logger';

const logger = createLogger('errorCapture');

export interface ErrorContext {
  source?: string;
  [key: string]: unknown;
}

export function captureError(error: unknown, context?: ErrorContext): void {
  const label = context?.source ? `[${context.source}] captured error` : 'captured error';
  // The `error` is wrapped alongside the context so the Sentry sink can call captureException with
  // the real Error (readable stack) and attach the rest as `extra`.
  logger.error(label, { error, ...(context ?? {}) });
}
