/**
 * Retry with exponential backoff for outbound Google API calls (WS-H). The `googleapis`
 * clients do no retrying by default, so a transient 429/5xx or a dropped socket previously
 * failed the whole operation. `withGoogleRetry` retries only errors that are safe to retry —
 * rate limits, 5xx, and network-level failures — with jittered backoff. A definitive 4xx
 * (404/409/permission) is NOT retried: the caller handles those (e.g. 409 = "already exists",
 * the idempotency signal in `calendarEvents.ts`).
 */
import { logger } from 'firebase-functions';

/** HTTP statuses worth retrying: rate-limit + transient server errors. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
/** Node/gaxios network error codes (no HTTP status) that are safe to retry. */
const RETRYABLE_NET_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE']);

/** The HTTP status carried by a gaxios/googleapis error, if any. */
export function googleErrorStatus(e: unknown): number | undefined {
  const err = e as { code?: number | string; status?: number; response?: { status?: number } };
  if (typeof err?.code === 'number') return err.code;
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.response?.status === 'number') return err.response.status;
  return undefined;
}

/** True for a transient failure (retryable status, or a network error with no HTTP status). */
export function isRetryableGoogleError(e: unknown): boolean {
  const status = googleErrorStatus(e);
  if (status !== undefined) return RETRYABLE_STATUS.has(status);
  const code = (e as { code?: string })?.code;
  return typeof code === 'string' && RETRYABLE_NET_CODES.has(code);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff + jitter. Non-retryable
 * errors (and the final attempt) rethrow immediately. Defaults: 3 retries, ~200ms base.
 */
export async function withGoogleRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isRetryableGoogleError(e)) throw e;
      const backoff = base * 2 ** attempt + Math.floor(Math.random() * base);
      logger.warn('Retrying Google API call after a transient error', {
        label: opts.label ?? 'google', attempt: attempt + 1, status: googleErrorStatus(e),
      });
      await sleep(backoff);
    }
  }
  throw lastErr;
}
