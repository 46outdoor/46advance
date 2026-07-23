/**
 * Emulator-backed tests for the retention sweep (WS-H): abandoned OAuth states, expired rate-limit
 * counters, and stale/dismissed bookings are pruned; live data (recent states, valid limits,
 * attached bookings, recent/future review bookings) is kept.
 *
 * Assertions target specific seeded doc ids, not whole-collection contents — the emulator is shared
 * across the sequential test files, so unrelated leftovers (e.g. rate-limit counters from other
 * callable tests) may coexist. That's fine: the sweep is global by design, and pruning a leftover
 * never affects these per-doc checks.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { runRetentionSweep } from './retention';
import { clearEmulators } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const NOW = 1_760_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const exists = async (path: string): Promise<boolean> => (await db.doc(path).get()).exists;

describe('runRetentionSweep', () => {
  beforeEach(clearEmulators);

  it('prunes abandoned OAuth states, expired rate limits, and stale bookings — keeps the rest', async () => {
    await db
      .doc('googleOAuthStates/old')
      .set({ uid: 'u', createdAt: Timestamp.fromMillis(NOW - 2 * HOUR) });
    await db
      .doc('googleOAuthStates/fresh')
      .set({ uid: 'u', createdAt: Timestamp.fromMillis(NOW - 5 * 60 * 1000) });

    await db.doc('rateLimits/ret-expired').set({ expiresAt: Timestamp.fromMillis(NOW - 1000) });
    await db.doc('rateLimits/ret-valid').set({ expiresAt: Timestamp.fromMillis(NOW + HOUR) });

    const bk = (id: string, data: Record<string, unknown>): Promise<unknown> =>
      db.doc(`events/e1/callBookings/${id}`).set(data);
    await bk('attached-old', { status: 'attached', startMillis: NOW - 100 * DAY }); // keep — the record
    await bk('dismissed-old', { status: 'dismissed', startMillis: NOW - 100 * DAY }); // prune
    await bk('dismissed-recent', { status: 'dismissed', startMillis: NOW - 5 * DAY }); // keep — within 30d
    await bk('review-old', { status: 'needs_review', startMillis: NOW - 100 * DAY }); // prune
    await bk('review-future', { status: 'needs_review', startMillis: NOW + 10 * DAY }); // keep — upcoming

    await runRetentionSweep(db, NOW);

    expect(await exists('googleOAuthStates/old')).toBe(false);
    expect(await exists('googleOAuthStates/fresh')).toBe(true);
    expect(await exists('rateLimits/ret-expired')).toBe(false);
    expect(await exists('rateLimits/ret-valid')).toBe(true);
    expect(await exists('events/e1/callBookings/attached-old')).toBe(true);
    expect(await exists('events/e1/callBookings/dismissed-old')).toBe(false);
    expect(await exists('events/e1/callBookings/dismissed-recent')).toBe(true);
    expect(await exists('events/e1/callBookings/review-old')).toBe(false);
    expect(await exists('events/e1/callBookings/review-future')).toBe(true);
  });

  it('is idempotent — a second sweep prunes nothing new', async () => {
    await db
      .doc('googleOAuthStates/old')
      .set({ uid: 'u', createdAt: Timestamp.fromMillis(NOW - 2 * HOUR) });
    await runRetentionSweep(db, NOW);
    const again = await runRetentionSweep(db, NOW);
    expect(again).toEqual({ states: 0, limits: 0, bookings: 0 });
  });
});
