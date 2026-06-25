/**
 * In-memory rate limiter (per Cloud Function instance).
 *
 * Not distributed — suitable only for lightweight, latency-sensitive throttling
 * where per-instance enforcement is acceptable. For security-sensitive or
 * external-API callables use the distributed limiter in `firestoreRateLimit.ts`.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}

/** Build a stable rate-limit key from parts (e.g. `['generatePacket', uid]`). */
export function makeRateLimitKey(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p) => p && String(p).trim().length > 0)
    .map(String)
    .join(':');
}
