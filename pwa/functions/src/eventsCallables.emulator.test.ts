/**
 * Emulator-backed tests for createBlankEvent (S3): atomic event + creator-membership
 * creation, idempotency by the client-supplied event id, and the create gate.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankEvent, createEventFromTemplate, renameEventSlug } from './index';
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
    // The authoritative active-user gate (assertActiveUser) reads users/{uid}; an approved
    // non-admin must have a record, mirroring production where syncUserClaims writes it.
    await db.doc(`users/${ORGANIZER.uid}`).set({ approved: true });
    await db.doc(`users/${APPROVED.uid}`).set({ approved: true });
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

  it('reserves the chosen slug in the slugs collection (WS-G)', async () => {
    await testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER));
    const reservation = await db.doc('slugs/alpha-festival').get();
    expect(reservation.exists).toBe(true);
    expect(reservation.get('eventId')).toBe('evt-new');
  });

  it('dedupes the slug against an existing reservation', async () => {
    await db.doc('slugs/alpha-festival').set({ eventId: 'other-event' });
    await testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ eventId: 'evt-2' }), ORGANIZER),
    );
    expect((await db.doc('events/evt-2').get()).get('slug')).toBe('alpha-festival-2');
    expect((await db.doc('slugs/alpha-festival-2').get()).get('eventId')).toBe('evt-2');
  });

  it('two events desiring the same slug get distinct reservations', async () => {
    await testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ eventId: 'evt-a' }), ORGANIZER),
    );
    await testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ eventId: 'evt-b' }), ORGANIZER),
    );
    expect((await db.doc('events/evt-a').get()).get('slug')).toBe('alpha-festival');
    expect((await db.doc('events/evt-b').get()).get('slug')).toBe('alpha-festival-2');
  });

  it('an idempotent retry reuses the reservation (no duplicate slug allocated)', async () => {
    await testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER));
    await testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER)); // retry
    expect((await db.doc('events/evt-new').get()).get('slug')).toBe('alpha-festival');
    expect((await db.doc('slugs/alpha-festival-2').get()).exists).toBe(false);
  });

  it('an admin can create a blank event', async () => {
    const res = await testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ eventId: 'evt-admin' }), ADMIN),
    );
    expect(res).toEqual({ eventId: 'evt-admin' });
  });
});

// Transactional slug rename (WS-G): reserve the new slug, release the old, update the event — all
// in one commit, gated to the event's PM/admin.
describe('renameEventSlug', () => {
  beforeEach(async () => {
    await clearEmulators();
    await db.doc(`users/${ORGANIZER.uid}`).set({ approved: true });
    await db.doc(`users/${APPROVED.uid}`).set({ approved: true });
  });

  const makeEvent = (id = 'evt-r'): Promise<unknown> =>
    testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ eventId: id, slug: 'first-slug' }), ORGANIZER),
    );

  it('moves the reservation: reserves new, releases old, updates the event', async () => {
    await makeEvent();
    const res = await testEnv.wrap(renameEventSlug)(
      callableRequest({ eventId: 'evt-r', slug: 'Second Slug' }, ORGANIZER),
    );
    expect(res).toEqual({ slug: 'second-slug' });
    expect((await db.doc('events/evt-r').get()).get('slug')).toBe('second-slug');
    expect((await db.doc('slugs/second-slug').get()).get('eventId')).toBe('evt-r');
    expect((await db.doc('slugs/first-slug').get()).exists).toBe(false); // released
  });

  it('dedupes against an existing reservation', async () => {
    await makeEvent();
    await db.doc('slugs/taken').set({ eventId: 'other' });
    const res = await testEnv.wrap(renameEventSlug)(
      callableRequest({ eventId: 'evt-r', slug: 'taken' }, ORGANIZER),
    );
    expect(res.slug).toBe('taken-2');
    expect((await db.doc('slugs/taken').get()).get('eventId')).toBe('other'); // untouched
  });

  it('is a no-op when the slug already resolves to the current one', async () => {
    await makeEvent();
    const res = await testEnv.wrap(renameEventSlug)(
      callableRequest({ eventId: 'evt-r', slug: 'first-slug' }, ORGANIZER),
    );
    expect(res).toEqual({ slug: 'first-slug' });
    expect((await db.doc('slugs/first-slug').get()).get('eventId')).toBe('evt-r');
  });

  it('rejects a caller who is not the event PM/admin', async () => {
    await makeEvent();
    await expect(
      testEnv.wrap(renameEventSlug)(callableRequest({ eventId: 'evt-r', slug: 'x' }, APPROVED)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

// AC-3 / F-1: a protected callable must consult the authoritative users/{uid} record, not just
// trust the caller's ID token — an admin's revocation has to take effect immediately, not after
// the ≤60-min token lifetime. createBlankEvent stands in for every resource-scoped callable
// (they all share assertActiveUser). ORGANIZER's token still carries approved:true (stale).
describe('createBlankEvent — authoritative revocation (AC-3)', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects a stale approved token once the users record is revoked (approved:false)', async () => {
    await db.doc(`users/${ORGANIZER.uid}`).set({ approved: false });
    await expect(
      testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a caller with no users record at all (deleted account — fail-closed)', async () => {
    await expect(
      testEnv.wrap(createBlankEvent)(callableRequest(baseInput(), ORGANIZER)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('still allows an admin with no users record (anti-lockout floor — decision #2)', async () => {
    const res = await testEnv.wrap(createBlankEvent)(
      callableRequest(baseInput({ eventId: 'evt-admin-floor' }), ADMIN),
    );
    expect(res).toEqual({ eventId: 'evt-admin-floor' });
  });
});

// Master-template section selection: `include` narrows which parts of the blueprint clone onto
// the new event. Omitting it must reproduce the historical full-blueprint behavior exactly, so
// an older client that knows nothing about the selection is unaffected.
describe('createEventFromTemplate — include selection', () => {
  const TEMPLATE_ID = 'tpl-house';
  const LEAD_UID = 'lead-uid';

  beforeEach(async () => {
    await clearEmulators();
    await db.doc(`users/${ORGANIZER.uid}`).set({ approved: true });
    await db.doc(`templates/${TEMPLATE_ID}`).set({
      name: '46 House Package',
      isDefault: true,
      departmentIds: ['audio', 'lighting'],
      stages: [{ id: 's1', name: 'Main Stage', order: 0 }],
      eventProduction: {
        info: { siteContact: 'Pat Reilly' },
        contacts: [{ role: 'PM', name: 'Alex', phone: '555-0100', email: 'alex@example.com' }],
        links: [{ label: 'Site map', url: 'https://example.com/map' }],
      },
      stageProduction: { s1: { content: { audio: { foh: { console: 'S6L' } } } } },
      members: [{ uid: LEAD_UID, role: 'department-lead' }],
      eventLogo: { onDark: { url: 'https://x/d.png', path: 'templates/t/d' }, onLight: null },
      scheduleTemplateIds: [],
    });
  });

  const create = (include?: Record<string, boolean>) =>
    testEnv.wrap(createEventFromTemplate)(
      callableRequest(
        {
          templateId: TEMPLATE_ID,
          ...(include ? { include } : {}),
          name: 'Alpha Festival',
          startDate: null,
          endDate: null,
          venue: 'Grounds',
          slug: 'alpha-festival',
        },
        ORGANIZER,
      ),
    );

  const stagesOf = async (eventId: string) =>
    (await db.collection(`events/${eventId}/stages`).get()).docs;

  it('omitting `include` clones the full blueprint (backward compatible)', async () => {
    const { eventId } = await create();
    const evt = await db.doc(`events/${eventId}`).get();
    expect(evt.get('departmentIds')).toEqual(['audio', 'lighting']);
    expect(evt.get('eventLogo')).not.toBeNull();

    const production = await db.doc(`events/${eventId}/production/record`).get();
    expect(production.get('info')).toEqual({ siteContact: 'Pat Reilly' });
    expect(production.get('contacts')).toHaveLength(1);

    const stages = await stagesOf(eventId);
    expect(stages).toHaveLength(1);
    expect(stages[0].get('name')).toBe('Main Stage');
    const housePackage = await db.doc(`${stages[0].ref.path}/production/record`).get();
    expect(housePackage.get('content')).toEqual({ audio: { foh: { console: 'S6L' } } });

    expect((await db.doc(`events/${eventId}/members/${LEAD_UID}`).get()).exists).toBe(true);
  });

  it('always records the source templateId, whatever the selection', async () => {
    const { eventId } = await create({ production: false, stages: false, members: false });
    expect((await db.doc(`events/${eventId}`).get()).get('templateId')).toBe(TEMPLATE_ID);
  });

  it('members:false drops the template roles but still writes the creator’s PM membership', async () => {
    const { eventId } = await create({ members: false });
    // An event must never exist without its creator's membership — that would orphan it.
    const creator = await db.doc(`events/${eventId}/members/${ORGANIZER.uid}`).get();
    expect(creator.exists).toBe(true);
    expect(creator.get('role')).toBe('production-manager');
    expect((await db.doc(`events/${eventId}/members/${LEAD_UID}`).get()).exists).toBe(false);
  });

  it('production:false leaves no production record', async () => {
    const { eventId } = await create({ production: false });
    expect((await db.doc(`events/${eventId}/production/record`).get()).exists).toBe(false);
    expect(await stagesOf(eventId)).toHaveLength(1); // unaffected
  });

  it('stages:false drops the stages and their house packages with them', async () => {
    // Per-stage packages are keyed by stage, so they have nowhere to land without stages.
    const { eventId } = await create({ stages: false });
    expect(await stagesOf(eventId)).toHaveLength(0);
    expect((await db.doc(`events/${eventId}/production/record`).get()).exists).toBe(true);
  });

  it('departments:false and logo:false leave those fields empty', async () => {
    const { eventId } = await create({ departments: false, logo: false });
    const evt = await db.doc(`events/${eventId}`).get();
    expect(evt.get('departmentIds')).toEqual([]);
    expect(evt.get('eventLogo')).toBeNull();
  });
});
