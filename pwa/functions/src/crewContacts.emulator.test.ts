import { beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { reconcileCrewContactSnapshots, sameSnapshot, snapshotFromContact } from './crewContacts';
import { clearEmulators } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();

/**
 * Crew-roster snapshot reconciliation (planning/ACCESS_SCOPING_PLAN.md §4.2).
 *
 * These copies are what a crew member sees INSTEAD of the global directory once the read rules
 * narrow, so the guarantees under test are: an edit propagates, a delete flags without erasing
 * the name, the write is confined to real event attachments (the per-event subcollection and
 * the global directory share the collection id `contacts`, so the collection-group query sees
 * both), and unrelated contacts are never touched.
 */
const db = () => getFirestore();

// Every id is `crewsnap-` prefixed: the emulator is SHARED across test files, so a
// collection-group query here sees another file's fixtures too. The count assertions below
// broke on exactly that (`crewLogistics.emulator.test.ts` also seeds a `contact-1` with an
// attachment). Isolation is by unique data, not by trusting `clearEmulators` to have run last —
// the same convention that file documents.
const CONTACT = 'crewsnap-contact-1';
const OTHER = 'crewsnap-contact-2';

const SNAPSHOT = {
  name: 'Dana Reyes',
  role: 'Audio',
  company: 'Deep South',
  phone: '555-0100',
  email: 'dana@example.com',
};

async function seed(): Promise<void> {
  await db().doc('events/crewsnap-event-a').set({ name: 'Event A' });
  await db().doc('events/crewsnap-event-b').set({ name: 'Event B' });
  await db()
    .doc(`contacts/${CONTACT}`)
    .set({ ...SNAPSHOT, createdBy: 'admin-1', userId: null });
  // The same person on two shows, plus somebody else's attachment that must not move.
  await db()
    .doc(`events/crewsnap-event-a/contacts/crewsnap-attach-1`)
    .set({ contactId: CONTACT, contact: SNAPSHOT });
  await db()
    .doc(`events/crewsnap-event-b/contacts/crewsnap-attach-2`)
    .set({ contactId: CONTACT, contact: SNAPSHOT });
  await db()
    .doc(`events/crewsnap-event-a/contacts/crewsnap-attach-other`)
    .set({ contactId: OTHER, contact: { ...SNAPSHOT, name: 'Sam Other' } });
}

beforeEach(async () => {
  await clearEmulators();
  await seed();
});

describe('reconcileCrewContactSnapshots', () => {
  it('propagates an edited contact to every attachment referencing it', async () => {
    const updated = { ...SNAPSHOT, name: 'Dana Reyes-Cole', phone: '555-0199' };

    const rewritten = await reconcileCrewContactSnapshots(db(), CONTACT, updated);

    expect(rewritten).toBe(2);
    const a = await db().doc('events/crewsnap-event-a/contacts/crewsnap-attach-1').get();
    const b = await db().doc('events/crewsnap-event-b/contacts/crewsnap-attach-2').get();
    expect(a.get('contact')).toEqual(updated);
    expect(b.get('contact')).toEqual(updated);
  });

  it('leaves other people’s attachments alone', async () => {
    await reconcileCrewContactSnapshots(db(), CONTACT, { ...SNAPSHOT, name: 'Changed' });

    const other = await db().doc('events/crewsnap-event-a/contacts/crewsnap-attach-other').get();
    expect(other.get('contact')).toMatchObject({ name: 'Sam Other' });
  });

  it('NEVER writes to the global directory, which shares the `contacts` collection id', async () => {
    // collectionGroup('contacts') matches the directory too. The contactId filter excludes it,
    // and the depth guard is the belt to that suspenders — a write landing on a directory entry
    // would corrupt the source of truth this whole mechanism copies from.
    const before = await db().doc(`contacts/${CONTACT}`).get();

    await reconcileCrewContactSnapshots(db(), CONTACT, { ...SNAPSHOT, name: 'Changed' });

    const after = await db().doc(`contacts/${CONTACT}`).get();
    expect(after.data()).toEqual(before.data());
    expect(after.get('contact')).toBeUndefined();
  });

  it('flags a deleted contact but KEEPS the copied name — who was on the show is history', async () => {
    const rewritten = await reconcileCrewContactSnapshots(db(), CONTACT, null);

    expect(rewritten).toBe(2);
    const a = await db().doc('events/crewsnap-event-a/contacts/crewsnap-attach-1').get();
    expect(a.get('contact')).toEqual(SNAPSHOT);
    expect(a.get('contactDeletedAt')).not.toBeNull();
  });

  it('clears the deleted flag if the contact comes back under the same id', async () => {
    await reconcileCrewContactSnapshots(db(), CONTACT, null);

    await reconcileCrewContactSnapshots(db(), CONTACT, SNAPSHOT);

    const a = await db().doc('events/crewsnap-event-a/contacts/crewsnap-attach-1').get();
    expect(a.get('contactDeletedAt')).toBeNull();
    expect(a.get('contact')).toEqual(SNAPSHOT);
  });

  it('is idempotent: a no-op reconcile writes nothing', async () => {
    // Contact writes are common (notes, photo, the userId link, audit stamps) and mostly touch
    // nothing copied here. Rewriting every attachment each time would be pure write amplification.
    const rewritten = await reconcileCrewContactSnapshots(db(), CONTACT, SNAPSHOT);

    expect(rewritten).toBe(0);
  });

  it('backfills an attachment that has no snapshot at all', async () => {
    await db()
      .doc('events/crewsnap-event-a/contacts/crewsnap-attach-legacy')
      .set({ contactId: CONTACT });

    const rewritten = await reconcileCrewContactSnapshots(db(), CONTACT, SNAPSHOT);

    expect(rewritten).toBe(1);
    const legacy = await db().doc('events/crewsnap-event-a/contacts/crewsnap-attach-legacy').get();
    expect(legacy.get('contact')).toEqual(SNAPSHOT);
  });
});

describe('snapshotFromContact', () => {
  it('copies exactly the display fields — never userId, which is authorization data', () => {
    const snapshot = snapshotFromContact({
      ...SNAPSHOT,
      userId: 'user-1',
      createdBy: 'admin-1',
      notes: 'private',
    });

    expect(snapshot).toEqual(SNAPSHOT);
  });

  it('normalizes missing/blank fields to null, and an unnamed contact to no snapshot', () => {
    expect(snapshotFromContact({ name: 'Solo' })).toEqual({
      name: 'Solo',
      role: null,
      company: null,
      phone: null,
      email: null,
    });
    expect(snapshotFromContact({ name: '' })).toBeNull();
    expect(snapshotFromContact(undefined)).toBeNull();
  });
});

describe('sameSnapshot', () => {
  it('treats a single changed field as different, and two nulls as equal', () => {
    expect(sameSnapshot(SNAPSHOT, { ...SNAPSHOT })).toBe(true);
    expect(sameSnapshot(SNAPSHOT, { ...SNAPSHOT, email: null })).toBe(false);
    expect(sameSnapshot(null, null)).toBe(true);
    expect(sameSnapshot(SNAPSHOT, null)).toBe(false);
  });
});
