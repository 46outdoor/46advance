/**
 * Emulator-backed tests for attachCallBooking (WS-G): manual booking→advance attach is now one
 * atomic transaction. Verifies the advance claim + booking flip commit together, that a booking
 * displaced from the same advance is requeued (not orphaned), idempotency, and the edit gate.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { attachCallBooking, createBlankEvent } from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const ORGANIZER = authContext('org-uid', { organizer: true, approved: true });
const OUTSIDER = authContext('out-uid', { approved: true });

const EVENT = 'evt-book';
const STAGE = 'stage-1';
const ADVANCE = 'adv-1';
const START = 1_760_000_000_000;

async function seed(): Promise<void> {
  await clearEmulators();
  await db.doc(`users/${ORGANIZER.uid}`).set({ approved: true });
  await db.doc(`users/${OUTSIDER.uid}`).set({ approved: true });
  // createBlankEvent makes ORGANIZER the event PM (so attach's canEditEvent gate passes).
  await testEnv.wrap(createBlankEvent)(
    callableRequest(
      { eventId: EVENT, name: 'Book Fest', startDate: null, endDate: null, venue: null, slug: 'book-fest' },
      ORGANIZER,
    ),
  );
  await db.doc(`events/${EVENT}/stages/${STAGE}`).set({ name: 'Main', createdBy: ORGANIZER.uid });
  await db.doc(`events/${EVENT}/stages/${STAGE}/advances/${ADVANCE}`).set({
    artistName: 'Band', createdBy: ORGANIZER.uid,
  });
}

const booking = (id: string, over: Record<string, unknown> = {}) => ({
  calendarEventId: id, artistName: 'Band', startMillis: START, meetLink: `https://meet/${id}`,
  status: 'needs_review', ...over,
});

const attach = (bookingId: string, auth = ORGANIZER) =>
  testEnv.wrap(attachCallBooking)(
    callableRequest({ eventId: EVENT, stageId: STAGE, advanceId: ADVANCE, bookingId }, auth),
  );

describe('attachCallBooking', () => {
  beforeEach(seed);

  it('claims the advance and flips the booking in one transaction', async () => {
    await db.doc(`events/${EVENT}/callBookings/cal-1`).set(booking('cal-1'));
    const res = await attach('cal-1');
    expect(res).toEqual({ attached: true, requeuedBookingId: null });

    const adv = await db.doc(`events/${EVENT}/stages/${STAGE}/advances/${ADVANCE}`).get();
    expect(adv.get('googleCalendarEventId')).toBe('cal-1');
    expect(adv.get('advanceCallLink')).toBe('https://meet/cal-1');
    expect((adv.get('advanceCallAt') as Timestamp).toMillis()).toBe(START);

    const book = await db.doc(`events/${EVENT}/callBookings/cal-1`).get();
    expect(book.get('status')).toBe('attached');
    expect(book.get('matchedAdvanceId')).toBe(ADVANCE);
  });

  it('requeues a booking it displaces from the same advance instead of orphaning it', async () => {
    // The advance already holds cal-old (as the cron auto-attach would leave it).
    await db.doc(`events/${EVENT}/stages/${STAGE}/advances/${ADVANCE}`).set({
      artistName: 'Band', createdBy: ORGANIZER.uid,
      advanceCallAt: Timestamp.fromMillis(START), advanceCallLink: 'https://meet/cal-old',
      googleCalendarEventId: 'cal-old',
    });
    await db.doc(`events/${EVENT}/callBookings/cal-old`).set(
      booking('cal-old', { status: 'attached', matchedAdvanceId: ADVANCE, matchedStageId: STAGE }),
    );
    await db.doc(`events/${EVENT}/callBookings/cal-new`).set(booking('cal-new'));

    const res = await attach('cal-new');
    expect(res).toEqual({ attached: true, requeuedBookingId: 'cal-old' });
    expect((await db.doc(`events/${EVENT}/stages/${STAGE}/advances/${ADVANCE}`).get()).get('googleCalendarEventId'))
      .toBe('cal-new');
    const old = await db.doc(`events/${EVENT}/callBookings/cal-old`).get();
    expect(old.get('status')).toBe('needs_review');
    expect(old.get('matchedAdvanceId')).toBeNull();
  });

  it('is idempotent when re-attaching the same booking', async () => {
    await db.doc(`events/${EVENT}/callBookings/cal-1`).set(booking('cal-1'));
    await attach('cal-1');
    const res = await attach('cal-1');
    expect(res).toEqual({ attached: true, requeuedBookingId: null });
    expect((await db.doc(`events/${EVENT}/callBookings/cal-1`).get()).get('status')).toBe('attached');
  });

  it('rejects a caller who is not the event PM/admin', async () => {
    await db.doc(`events/${EVENT}/callBookings/cal-1`).set(booking('cal-1'));
    await expect(attach('cal-1', OUTSIDER)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('errors when the booking does not exist', async () => {
    await expect(attach('missing')).rejects.toMatchObject({ code: 'not-found' });
  });
});
