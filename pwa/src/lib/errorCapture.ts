/**
 * Canonical error reporting. Route all caught errors through `captureError`
 * (see AGENTS.md / .claude/rules/security.md). It logs via the logger and
 * forwards to Sentry once wired.
 */
import { createLogger } from '@/lib/logger';
import { captureExceptionToSentry } from '@/lib/sentry';

const logger = createLogger('errorCapture');

export interface ErrorContext {
  source?: string;
  [key: string]: unknown;
}

export function captureError(error: unknown, context?: ErrorContext): void {
  const label = context?.source ? `[${context.source}] captured error` : 'captured error';
  logger.error(label, error);
  captureExceptionToSentry(error, context);
}
