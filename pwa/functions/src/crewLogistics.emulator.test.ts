import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  detachEventContact,
  relinkContactUser,
  reconcileCrewLogisticsForContact,
  RELINK_MAX_RECORDS,
} from './crewLogistics';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();

// Handler tests for the crew-logistics lifecycle (planning/CREW_TRAVEL_LODGING_PLAN.md
// §4.2/§4.7): the eventually consistent reconcile path (null→uid / uid→null), the
// server-owned roster detach that refuses while dependents exist, and the bounded ATOMIC
// admin relink — including the over-cap case failing with zero writes, which is the
// property the whole design exists to guarantee.

const db = () => getFirestore();

const EVENT = 'event-x';
const CONTACT = 'contact-1';
const ATTACH = 'attach-1';

async function seedRoster(): Promise<void> {
  await db().doc(`events/${EVENT}`).set({ name: 'Event X', status: 'active' });
  await db()
    .doc(`events/${EVENT}/members/pm-1`)
    .set({ role: 'production-manager', uid: 'pm-1' });
  // assertActiveUser is fail-closed on the server-owned users/{uid} record.
  await db().doc('users/pm-1').set({ approved: true });
  await db().doc('users/tech-1').set({ approved: true });
  await db().doc(`contacts/${CONTACT}`).set({ name: 'Terry Tech', createdBy: 'admin-1', userId: null });
  await db().doc(`events/${EVENT}/contacts/${ATTACH}`).set({ contactId: CONTACT });
}

function logisticsDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  // Default ids deliberately do NOT collide with ATTACH/CONTACT-scoped assertions: tests
  // that count (collection-group) or block (dependents query) always pass explicit unique
  // ids, so another test's residue can never change their outcome — isolation by data,
  // not by trusting the emulator clear.
  return {
    kind: 'lodging',
    eventContactId: 'attach-x',
    contactId: CONTACT,
    userId: null,
    hotelName: 'Hampton Inn',
    checkInDate: '2026-07-09',
    checkOutDate: '2026-07-12',
    createdBy: 'pm-1',
    ...over,
  };
}

afterAll(() => {
  testEnv.cleanup();
});

beforeEach(async () => {
  await clearEmulators();
  await seedRoster();
});

describe('reconcileCrewLogisticsForContact', () => {
  it('null→uid backfill: first-sign-in linking makes pre-created records visible', async () => {
    const c = 'contact-backfill';
    await db().collection(`events/${EVENT}/crewLogistics`).doc('r1').set(logisticsDoc({ contactId: c }));
    await db().collection(`events/${EVENT}/crewLogistics`).doc('r2').set(logisticsDoc({ contactId: c }));

    const rewritten = await reconcileCrewLogisticsForContact(db(), c, 'uid-tech');
    expect(rewritten).toBe(2);
    const r1 = await db().doc(`events/${EVENT}/crewLogistics/r1`).get();
    expect(r1.get('userId')).toBe('uid-tech');
  });

  it('uid→null cleanup: skips already-aligned records', async () => {
    const c = 'contact-cleanup';
    await db()
      .collection(`events/${EVENT}/crewLogistics`)
      .doc('c1')
      .set(logisticsDoc({ contactId: c, userId: 'uid-tech' }));
    await db().collection(`events/${EVENT}/crewLogistics`).doc('c2').set(logisticsDoc({ contactId: c })); // already null

    const rewritten = await reconcileCrewLogisticsForContact(db(), c, null);
    expect(rewritten).toBe(1);
  });

  it('handles more records than one write batch (ChunkedBatch spillover)', async () => {
    // ChunkedBatch splits above ~400 ops; 450 records forces at least two commits. A
    // test-unique contactId keys the collection-group query so no other test's records can
    // pollute the count, however the emulator's clear interleaves.
    const bulkContact = 'contact-bulk';
    await db().doc(`contacts/${bulkContact}`).set({ name: 'Bulk', createdBy: 'admin-1', userId: null });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 450; i++) {
      writes.push(
        db()
          .collection(`events/${EVENT}/crewLogistics`)
          .doc(`bulk-${i}`)
          .set(logisticsDoc({ contactId: bulkContact })),
      );
    }
    await Promise.all(writes);

    const rewritten = await reconcileCrewLogisticsForContact(db(), bulkContact, 'uid-tech');
    expect(rewritten).toBe(450);
    const sample = await db().doc(`events/${EVENT}/crewLogistics/bulk-449`).get();
    expect(sample.get('userId')).toBe('uid-tech');
  });
});

describe('detachEventContact', () => {
  const asPm = () => authContext('pm-1', { approved: true });

  it('detaches a roster attachment with no dependents', async () => {
    const res = await testEnv.wrap(detachEventContact)(
      callableRequest({ eventId: EVENT, attachId: ATTACH }, asPm()),
    );
    expect(res).toMatchObject({ detached: true });
    const attach = await db().doc(`events/${EVENT}/contacts/${ATTACH}`).get();
    expect(attach.exists).toBe(false);
  });

  it('REFUSES while any logistics record references the attachment', async () => {
    await db()
      .collection(`events/${EVENT}/crewLogistics`)
      .doc('dep-1')
      .set(logisticsDoc({ eventContactId: ATTACH }));
    await expect(
      testEnv.wrap(detachEventContact)(
        callableRequest({ eventId: EVENT, attachId: ATTACH }, asPm()),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const attach = await db().doc(`events/${EVENT}/contacts/${ATTACH}`).get();
    expect(attach.exists).toBe(true); // nothing deleted
  });

  it('denies a non-PM caller', async () => {
    await expect(
      testEnv.wrap(detachEventContact)(
        callableRequest(
          { eventId: EVENT, attachId: ATTACH },
          authContext('tech-1', { approved: true }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('relinkContactUser', () => {
  const asAdmin = () => authContext('admin-1', { admin: true });

  it('denies a non-admin — including a production director', async () => {
    await expect(
      testEnv.wrap(relinkContactUser)(
        callableRequest(
          { contactId: CONTACT, uid: 'uid-b' },
          authContext('dir-1', { approved: true, productionDirector: true }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('A→B relink atomically moves the contact link, user pointers, and every record copy', async () => {
    const c = 'contact-ab';
    await getAuth().createUser({ uid: 'uid-a', email: 'a@x.test' });
    await getAuth().createUser({ uid: 'uid-b', email: 'b@x.test' });
    await db().doc(`contacts/${c}`).set({ name: 'AB', userId: 'uid-a', createdBy: 'admin-1' });
    await db().doc('users/uid-a').set({ contactId: c });
    await db().collection(`events/${EVENT}/crewLogistics`).doc('ab1').set(logisticsDoc({ contactId: c, userId: 'uid-a' }));
    await db().collection(`events/${EVENT}/crewLogistics`).doc('ab2').set(logisticsDoc({ contactId: c, userId: 'uid-a' }));

    const res = await testEnv.wrap(relinkContactUser)(
      callableRequest({ contactId: c, uid: 'uid-b' }, asAdmin()),
    );
    expect(res).toMatchObject({ uid: 'uid-b', reconciledRecords: 2 });

    expect((await db().doc(`contacts/${c}`).get()).get('userId')).toBe('uid-b');
    expect((await db().doc('users/uid-b').get()).get('contactId')).toBe(c);
    expect((await db().doc('users/uid-a').get()).get('contactId')).toBeUndefined();
    expect((await db().doc(`events/${EVENT}/crewLogistics/ab1`).get()).get('userId')).toBe('uid-b');
    expect((await db().doc(`events/${EVENT}/crewLogistics/ab2`).get()).get('userId')).toBe('uid-b');
  });

  it('unlink (uid: null) clears the link and every copy', async () => {
    const c = 'contact-unlink';
    await getAuth().createUser({ uid: 'uid-a2', email: 'a2@x.test' });
    await db().doc(`contacts/${c}`).set({ name: 'U', userId: 'uid-a2', createdBy: 'admin-1' });
    await db().doc('users/uid-a2').set({ contactId: c });
    await db().collection(`events/${EVENT}/crewLogistics`).doc('u1').set(logisticsDoc({ contactId: c, userId: 'uid-a2' }));

    const res = await testEnv.wrap(relinkContactUser)(
      callableRequest({ contactId: c, uid: null }, asAdmin()),
    );
    expect(res).toMatchObject({ uid: null, reconciledRecords: 1 });
    expect((await db().doc(`events/${EVENT}/crewLogistics/u1`).get()).get('userId')).toBeNull();
  });

  it('refuses when the target account is already linked to a different contact', async () => {
    await getAuth().createUser({ uid: 'uid-taken', email: 'taken@x.test' });
    await db().doc('contacts/other-contact').set({ name: 'Other', createdBy: 'admin-1', userId: 'uid-taken' });

    await expect(
      testEnv.wrap(relinkContactUser)(
        callableRequest({ contactId: CONTACT, uid: 'uid-taken' }, asAdmin()),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('over-cap relink fails with NO partial writes', async () => {
    const c = 'contact-cap';
    await getAuth().createUser({ uid: 'uid-cap', email: 'cap@x.test' });
    await db().doc(`contacts/${c}`).set({ name: 'Cap', userId: null, createdBy: 'admin-1' });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < RELINK_MAX_RECORDS + 1; i++) {
      writes.push(db().collection(`events/${EVENT}/crewLogistics`).doc(`cap-${i}`).set(logisticsDoc({ contactId: c })));
    }
    await Promise.all(writes);

    await expect(
      testEnv.wrap(relinkContactUser)(
        callableRequest({ contactId: c, uid: 'uid-cap' }, asAdmin()),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    // Zero writes applied: the contact link and a sample record are untouched.
    expect((await db().doc(`contacts/${c}`).get()).get('userId')).toBeNull();
    expect((await db().doc(`events/${EVENT}/crewLogistics/cap-0`).get()).get('userId')).toBeNull();
  });

  it('no-op relink (same uid) succeeds with zero reconciled records', async () => {
    const c = 'contact-same';
    await getAuth().createUser({ uid: 'uid-same', email: 'same@x.test' });
    await db().doc(`contacts/${c}`).set({ name: 'S', userId: 'uid-same', createdBy: 'admin-1' });

    const res = await testEnv.wrap(relinkContactUser)(
      callableRequest({ contactId: c, uid: 'uid-same' }, asAdmin()),
    );
    expect(res).toMatchObject({ reconciledRecords: 0 });
  });
});
