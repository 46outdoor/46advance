/**
 * Emulator-backed handler tests for the schedule-sync callables (redesign PR 4). These
 * exercise the auth gates, input validation, day lookup, and the graceful
 * not-connected path — everything short of the Google Calendar API itself (no OAuth
 * tokens exist in the emulator, so `authedClientForUser` fails and the handlers return
 * their no-op results).
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { reconcileScheduleDay, removeScheduleCalendarEvent } from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const EVENT_ID = 'evt-sched';
const DAY_ID = '2026-07-14';
const ADMIN = authContext('admin-uid', { admin: true, approved: true });
const PM = authContext('pm-uid', { approved: true });
const TECH = authContext('tech-uid', { approved: true });

async function seedEventAndDay(): Promise<void> {
  await db.doc(`events/${EVENT_ID}`).set({ name: 'Event', timeZone: 'America/Chicago' });
  await db.doc(`events/${EVENT_ID}/members/${PM.uid}`).set({ role: 'production-manager', uid: PM.uid });
  await db.doc(`events/${EVENT_ID}/members/${TECH.uid}`).set({ role: 'tech', uid: TECH.uid });
  await db.doc(`events/${EVENT_ID}/scheduleDays/${DAY_ID}`).set({
    date: DAY_ID,
    dayType: 'loadIn',
    title: null,
    description: null,
    notes: null,
    items: [
      {
        id: 'i1',
        type: 'labor',
        customLabel: null,
        startTime: '08:00',
        endTime: '18:00',
        endEstimated: true,
        item: 'Crew Call',
        description: null,
        stageId: null,
        fields: {},
        crew: [{ type: 'Stagehands', quantity: 24, hours: null }],
        pushToCalendar: true,
        googleCalendarEventId: null,
      },
    ],
    createdBy: PM.uid,
  });
}

describe('reconcileScheduleDay', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedEventAndDay();
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(reconcileScheduleDay)(callableRequest({ eventId: EVENT_ID, dayId: DAY_ID })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects a non-PM member (tech)', async () => {
    await expect(
      testEnv.wrap(reconcileScheduleDay)(callableRequest({ eventId: EVENT_ID, dayId: DAY_ID }, TECH)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects invalid input and a missing day', async () => {
    await expect(
      testEnv.wrap(reconcileScheduleDay)(callableRequest({ eventId: EVENT_ID }, ADMIN)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      testEnv.wrap(reconcileScheduleDay)(callableRequest({ eventId: EVENT_ID, dayId: '2026-01-01' }, ADMIN)),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('is a graceful no-op for an editor without a Google connection (admin + PM)', async () => {
    const asAdmin = await testEnv.wrap(reconcileScheduleDay)(
      callableRequest({ eventId: EVENT_ID, dayId: DAY_ID }, ADMIN),
    );
    expect(asAdmin).toEqual({ synced: false, reason: 'not_connected' });
    const asPm = await testEnv.wrap(reconcileScheduleDay)(
      callableRequest({ eventId: EVENT_ID, dayId: DAY_ID }, PM),
    );
    expect(asPm).toEqual({ synced: false, reason: 'not_connected' });
  });
});

describe('removeScheduleCalendarEvent', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedEventAndDay();
  });

  it('rejects unauthenticated and non-editor calls', async () => {
    await expect(
      testEnv.wrap(removeScheduleCalendarEvent)(
        callableRequest({ eventId: EVENT_ID, calendarEventId: 'cal-1' }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      testEnv.wrap(removeScheduleCalendarEvent)(
        callableRequest({ eventId: EVENT_ID, calendarEventId: 'cal-1' }, TECH),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('is a graceful no-op without a Google connection', async () => {
    const res = await testEnv.wrap(removeScheduleCalendarEvent)(
      callableRequest({ eventId: EVENT_ID, calendarEventId: 'cal-1' }, PM),
    );
    expect(res).toEqual({ removed: false, reason: 'not_connected' });
  });
});
