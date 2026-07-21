/**
 * Emulator-backed tests for createBlankEvent (S3): atomic event + creator-membership
 * creation, idempotency by the client-supplied event id, and the create gate.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankEvent } from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const ORGANIZER = authContext('org-uid', { organizer: true, approved: true });
const ADMIN = authContext('admin-uid', { admin: true, approved: true });
const APPROVED = authContext('plain-uid', { approved: true });

const baseInput = (over: Record<string, unknown> = {}) => ({
  eventId: 'evt-new',
  name: 'Alpha Festival',
  startDate: null,
  endDate: null,
  venue: 'Grounds',
  slug: 'alpha-festival',
  ...over,
});

describe('createBlankEvent', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(createBlankEvent)(callableRequest(baseInput())),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('an approved user who is not an organizer/admin cannot create events', async () => {
    await expect(
      testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), APPROVED)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('an organizer creates the event AND their PM membership atomically', async () => {
    const res = await testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER));
    expect(res).toEqual({ eventId: 'evt-new' });

    const evt = await db.doc('events/evt-new').get();
    expect(evt.exists).toBe(true);
    expect(evt.get('createdBy')).toBe(ORGANIZER.uid);
    expect(evt.get('name')).toBe('Alpha Festival');
    expect(evt.get('status')).toBe('draft');

    const member = await db.doc(`events/evt-new/members/${ORGANIZER.uid}`).get();
    expect(member.exists).toBe(true);
    expect(member.get('role')).toBe('production-manager');
    expect(member.get('uid')).toBe(ORGANIZER.uid);
  });

  it('is idempotent — a retry with the same id returns the event without duplicating or overwriting', async () => {
    await testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER));
    // A second call with the same id (e.g. a timed-out retry) must no-op, even if fields differ.
    const res2 = await testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ name: 'Renamed' }), ORGANIZER),
    );
    expect(res2).toEqual({ eventId: 'evt-new' });
    const evt = await db.doc('events/evt-new').get();
    expect(evt.get('name')).toBe('Alpha Festival'); // original, not overwritten by the retry
  });

  it("rejects reusing another owner's event id", async () => {
    await testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER));
    await expect(
      testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ADMIN)),
    ).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('dedupes the slug against existing events', async () => {
    await db.doc('events/existing').set({ name: 'X', status: 'active', createdBy: 'someone', slug: 'alpha-festival' });
    await testEnv.wrap(createBlankEvent)(callableRequest(baseInput({ eventId: 'evt-2' }), ORGANIZER));
    const evt = await db.doc('events/evt-2').get();
    expect(evt.get('slug')).toBe('alpha-festival-2');
  });

  it('an admin can create a blank event', async () => {
    const res = await testEnv.wrap(createBlankEvent)(callableRequest(baseInput({ eventId: 'evt-admin' }), ADMIN));
    expect(res).toEqual({ eventId: 'evt-admin' });
  });
});
