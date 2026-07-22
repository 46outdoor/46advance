import { describe, expect, it } from 'vitest';
import { googleErrorStatus, isRetryableGoogleError, withGoogleRetry } from './retry';

describe('googleErrorStatus', () => {
  it('reads status from code, status, or response.status', () => {
    expect(googleErrorStatus({ code: 503 })).toBe(503);
    expect(googleErrorStatus({ status: 429 })).toBe(429);
    expect(googleErrorStatus({ response: { status: 500 } })).toBe(500);
    expect(googleErrorStatus({ code: 'ECONNRESET' })).toBeUndefined();
    expect(googleErrorStatus(new Error('x'))).toBeUndefined();
  });
});

describe('isRetryableGoogleError', () => {
  it('retries rate-limit + 5xx statuses, not 4xx', () => {
    for (const s of [429, 500, 502, 503, 504]) expect(isRetryableGoogleError({ code: s })).toBe(true);
    for (const s of [400, 401, 403, 404, 409]) expect(isRetryableGoogleError({ code: s })).toBe(false);
  });

  it('retries network-level errors that carry no HTTP status', () => {
    expect(isRetryableGoogleError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableGoogleError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableGoogleError({ code: 'NOPE' })).toBe(false);
    expect(isRetryableGoogleError(new Error('plain'))).toBe(false);
  });
});

describe('withGoogleRetry', () => {
  it('returns the first success without retrying', async () => {
    let calls = 0;
    const r = await withGoogleRetry(async () => {
      calls += 1;
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries transient failures then succeeds', async () => {
    let calls = 0;
    const r = await withGoogleRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { code: 503 };
        return 'ok';
      },
      { baseDelayMs: 0 },
    );
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry a non-retryable error (e.g. 409)', async () => {
    let calls = 0;
    await expect(
      withGoogleRetry(
        async () => {
          calls += 1;
          throw { code: 409 };
        },
        { baseDelayMs: 0 },
      ),
    ).rejects.toEqual({ code: 409 });
    expect(calls).toBe(1);
  });

  it('gives up after the retry budget and rethrows the last error', async () => {
    let calls = 0;
    await expect(
      withGoogleRetry(
        async () => {
          calls += 1;
          throw { code: 500 };
        },
        { retries: 2, baseDelayMs: 0 },
      ),
    ).rejects.toEqual({ code: 500 });
    expect(calls).toBe(3); // initial + 2 retries
  });
});
