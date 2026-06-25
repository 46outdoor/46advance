/**
 * Firestore-backed distributed rate limiter.
 *
 * Unlike the in-memory limiter (`rateLimit.ts`), this persists state in
 * Firestore and so enforces a single cap across all Cloud Function instances.
 * Use it for external-API and abuse-sensitive callables (OAuth, Calendar/Meet,
 * Drive, PDF generation) per `.claude/rules/security.md`.
 *
 * Documents live in the `rateLimits` collection, keyed by a hashed key, and
 * carry an `expiresAt` field — enable a Firestore TTL policy on that field to
 * garbage-collect expired windows automatically. The collection is server-only
 * (firestore.rules denies all client access; the Admin SDK bypasses rules).
 */

import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { createHash } from 'node:crypto';

import { makeRateLimitKey, type RateLimitResult } from './rateLimit.js';

export type { RateLimitResult };

const COLLECTION = 'rateLimits';

/** Default sliding window for callable limits. */
export const RATE_WINDOW_MS = 60_000;

interface RateLimitDocument {
  count: number;
  windowStart: number;
  windowMs: number;
  expiresAt: Timestamp;
  updatedAt: number;
}

/**
 * Hash a rate-limit key to a safe Firestore document id, keeping a short
 * human-readable prefix (the first key segment) for console browsing.
 */
function hashKey(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.split(':')[0] || 'rl';
  return `${prefix}:${hash.slice(0, 24)}`;
}

/**
 * Atomically check and increment a Firestore-backed rate limit.
 * Returns whether the request is allowed plus remaining/resetAt metadata.
 */
export async function checkFirestoreRateLimit(
  db: Firestore,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const docRef = db.collection(COLLECTION).doc(hashKey(key));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const now = Date.now();

    const startNewWindow = (): RateLimitResult => {
      const resetAt = now + windowMs;
      const doc: RateLimitDocument = {
        count: 1,
        windowStart: now,
        windowMs,
        expiresAt: Timestamp.fromMillis(resetAt),
        updatedAt: now,
      };
      tx.set(docRef, doc);
      return { allowed: true, remaining: limit - 1, resetAt };
    };

    if (!snap.exists) return startNewWindow();

    const data = snap.data() as RateLimitDocument;
    const windowEnd = data.windowStart + data.windowMs;

    if (now >= windowEnd) return startNewWindow();

    if (data.count >= limit) {
      logger.warn('Firestore rate limit exceeded', { key, limit, windowMs, count: data.count });
      return { allowed: false, remaining: 0, resetAt: windowEnd };
    }

    const newCount = data.count + 1;
    tx.update(docRef, { count: newCount, updatedAt: now });
    return { allowed: true, remaining: Math.max(0, limit - newCount), resetAt: windowEnd };
  });
}

/**
 * Convenience wrapper for callables: enforce a per-key limit and throw a
 * `resource-exhausted` HttpsError when exceeded. One-liner at call sites:
 *
 *   await enforceRateLimit(db, ['generatePacket', uid], 10);
 */
export async function enforceRateLimit(
  db: Firestore,
  keyParts: Array<string | null | undefined>,
  limit: number,
  windowMs: number = RATE_WINDOW_MS,
): Promise<void> {
  const result = await checkFirestoreRateLimit(db, makeRateLimitKey(keyParts), limit, windowMs);
  if (!result.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment and try again.');
  }
}
