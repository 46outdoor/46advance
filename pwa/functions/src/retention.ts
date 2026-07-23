/**
 * Scheduled data-retention sweep (WS-H). Three collections previously grew without bound because
 * nothing ever pruned them:
 *   - `googleOAuthStates` — single-use CSRF states deleted only on a completed callback; an
 *     abandoned consent flow (popup closed / denied) left the state forever.
 *   - `rateLimits` — distributed counters carry an `expiresAt` but the TTL was documentation-only
 *     (a native Firestore TTL policy that may never have been enabled).
 *   - `callBookings` — synced booking review docs are never deleted; dismissed/stale ones pile up.
 *
 * This daily Admin-SDK job (no OAuth) prunes all three idempotently — a partial run self-heals the
 * next day. It complements, and does not require, a native Firestore TTL policy.
 */
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { ChunkedBatch } from './lib/db/chunkedBatch.js';

const TIME_ZONE = 'America/Chicago';
/** Abandoned OAuth consent flows older than this are pruned (the valid TTL is ~10 min). */
const OAUTH_STATE_MAX_AGE_MS = 60 * 60 * 1000;
/** Non-attached bookings this far past their start are pruned. Comfortably beyond the booking
 *  sync's −7d/+120d window, so a pruned booking can't be re-scanned from the calendar and
 *  resurrected into the review queue. `attached` bookings (the record of a booked call) are kept. */
const BOOKING_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface RetentionCounts {
  states: number;
  limits: number;
  bookings: number;
}

/** Prune the three unbounded collections as of `nowMs`. Exported (separate from the schedule
 *  wrapper) so it can run against the emulator with a fixed clock. Idempotent. */
export async function runRetentionSweep(db: Firestore, nowMs: number): Promise<RetentionCounts> {
  const batch = new ChunkedBatch(db);
  const counts: RetentionCounts = { states: 0, limits: 0, bookings: 0 };

  // 1) Abandoned OAuth CSRF states (created but never consumed by the callback).
  const stateCutoff = Timestamp.fromMillis(nowMs - OAUTH_STATE_MAX_AGE_MS);
  const staleStates = await db
    .collection('googleOAuthStates')
    .where('createdAt', '<', stateCutoff)
    .get();
  staleStates.forEach((d) => {
    batch.delete(d.ref);
    counts.states += 1;
  });

  // 2) Expired distributed rate-limit counters.
  const expiredLimits = await db
    .collection('rateLimits')
    .where('expiresAt', '<', Timestamp.fromMillis(nowMs))
    .get();
  expiredLimits.forEach((d) => {
    batch.delete(d.ref);
    counts.limits += 1;
  });

  // 3) Stale bookings: dismissed or never-resolved (needs_review) docs well past their time. A
  //    full group scan + in-code filter avoids a composite index (fine at this scale); 'attached'
  //    bookings are kept as the record of a booked call.
  const bookingCutoff = nowMs - BOOKING_STALE_MS;
  const allBookings = await db.collectionGroup('callBookings').get();
  allBookings.forEach((d) => {
    if (d.get('status') === 'attached') return;
    const startMillis =
      typeof d.get('startMillis') === 'number' ? (d.get('startMillis') as number) : 0;
    if (startMillis > 0 && startMillis < bookingCutoff) {
      batch.delete(d.ref);
      counts.bookings += 1;
    }
  });

  await batch.commit();
  return counts;
}

export const scheduledDataRetention = onSchedule(
  { schedule: '30 3 * * *', timeZone: TIME_ZONE, timeoutSeconds: 300, memory: '256MiB' },
  async () => {
    const counts = await runRetentionSweep(getFirestore(), Date.now());
    logger.info('Retention sweep complete', counts);
  },
);
