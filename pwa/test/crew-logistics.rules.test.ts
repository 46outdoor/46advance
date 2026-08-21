import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Crew travel & lodging rules (planning/CREW_TRAVEL_LODGING_PLAN.md §4.3/§4.7). In its own
// file (the main firestore matrix sits at the test-file size limit) — same pattern as
// storage-oversight.rules.test.ts. The suite's center of gravity is the privacy boundary:
// records carry room numbers and confirmation codes, so reads are NARROWER than
// canReadEvent, the identity triple is server-verified on write, and the contact link
// (`userId`) is immutable through every direct client write INCLUDING an admin's.

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url));

let testEnv: RulesTestEnvironment;

const ADMIN = { uid: 'admin-1', token: { admin: true } };
const PM = 'user-pm'; // production-manager on event A
const TECH = 'user-tech'; // tech on event A, linked to contact-tech
const TECH2 = 'user-tech2'; // tech on event A, linked to nothing
const OUTSIDER = 'user-out'; // approved, member of nothing, but a record carries their uid
const DIRECTOR = { uid: 'user-director', token: { approved: true, productionDirector: true } };

const dbFor = (uid: string, token: Record<string, unknown> = { approved: true }) =>
  testEnv.authenticatedContext(uid, token).firestore();

/** A valid lodging payload for attach-tech, as the PM would write it. */
const validLodging = () => ({
  kind: 'lodging',
  eventContactId: 'attach-tech',
  contactId: 'contact-tech',
  userId: TECH,
  hotelName: 'Hampton Inn Ashland',
  address: null,
  hotelPhone: null,
  confirmation: 'ABC123',
  checkInDate: '2026-07-09',
  checkOutDate: '2026-07-12',
  roomType: null,
  roomNumber: '412',
  notes: null,
  createdBy: PM,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-46advance',
    firestore: { rules: readFileSync(rulesPath, 'utf8') },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'events/event-a'), { name: 'Event A', status: 'active' });
    await setDoc(doc(db, 'events/event-a/members', PM), {
      role: 'production-manager',
      uid: PM,
    });
    await setDoc(doc(db, 'events/event-a/members', TECH), { role: 'tech', uid: TECH });
    await setDoc(doc(db, 'events/event-a/members', TECH2), { role: 'tech', uid: TECH2 });
    // Directory contacts: one linked to TECH, one unlinked.
    await setDoc(doc(db, 'contacts/contact-tech'), {
      name: 'Terry Tech',
      createdBy: ADMIN.uid,
      userId: TECH,
    });
    await setDoc(doc(db, 'contacts/contact-nolink'), {
      name: 'Norma Nolink',
      createdBy: ADMIN.uid,
      userId: null,
    });
    // Roster attachments on event A.
    await setDoc(doc(db, 'events/event-a/contacts/attach-tech'), { contactId: 'contact-tech' });
    await setDoc(doc(db, 'events/event-a/contacts/attach-nolink'), {
      contactId: 'contact-nolink',
    });
    // Seed records: one owned by TECH, one unlinked, one carrying a NON-member's uid.
    await setDoc(doc(db, 'events/event-a/crewLogistics/log-tech'), {
      ...validLodging(),
      createdAt: null,
      updatedAt: null,
    });
    await setDoc(doc(db, 'events/event-a/crewLogistics/log-nolink'), {
      ...validLodging(),
      eventContactId: 'attach-nolink',
      contactId: 'contact-nolink',
      userId: null,
      roomNumber: '210',
      createdAt: null,
      updatedAt: null,
    });
    await setDoc(doc(db, 'events/event-a/crewLogistics/log-outsider'), {
      ...validLodging(),
      userId: OUTSIDER,
      createdAt: null,
      updatedAt: null,
    });
  });
});

describe('crewLogistics — read boundary (narrower than canReadEvent)', () => {
  it('PM lists every record (unconstrained query)', async () => {
    await assertSucceeds(getDocs(collection(dbFor(PM), 'events/event-a/crewLogistics')));
  });

  it('director lists every record with NO membership row — decision 12', async () => {
    await assertSucceeds(
      getDocs(collection(dbFor(DIRECTOR.uid, DIRECTOR.token), 'events/event-a/crewLogistics')),
    );
  });

  it('a tech reads their own record', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/crewLogistics/log-tech')));
  });

  it("a tech is denied another person's record", async () => {
    await assertFails(getDoc(doc(dbFor(TECH2), 'events/event-a/crewLogistics/log-tech')));
    await assertFails(getDoc(doc(dbFor(TECH), 'events/event-a/crewLogistics/log-nolink')));
  });

  it('the list-query trap: a tech is denied the unconstrained list but succeeds uid-constrained', async () => {
    const db = dbFor(TECH);
    await assertFails(getDocs(collection(db, 'events/event-a/crewLogistics')));
    await assertSucceeds(
      getDocs(query(collection(db, 'events/event-a/crewLogistics'), where('userId', '==', TECH))),
    );
  });

  it('a matching uid WITHOUT approval is denied (isMember carries the active gate)', async () => {
    await assertFails(
      getDoc(doc(dbFor(TECH, { approved: false }), 'events/event-a/crewLogistics/log-tech')),
    );
  });

  it('a matching uid who is NOT a member is denied — uid match alone is not access', async () => {
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/crewLogistics/log-outsider')));
  });
});

describe('crewLogistics — write gate + server-verified identity', () => {
  it('PM creates a valid record', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/crewLogistics/new-1'), validLodging()),
    );
  });

  it('a tech cannot write, even about themselves', async () => {
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/crewLogistics/new-2'), {
        ...validLodging(),
        createdBy: TECH,
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor(TECH), 'events/event-a/crewLogistics/log-tech'), {
        roomNumber: '999',
      }),
    );
    await assertFails(deleteDoc(doc(dbFor(TECH), 'events/event-a/crewLogistics/log-tech')));
  });

  it('the director claim carries no logistics write — read-only oversight', async () => {
    const db = dbFor(DIRECTOR.uid, DIRECTOR.token);
    await assertFails(setDoc(doc(db, 'events/event-a/crewLogistics/new-3'), validLodging()));
    await assertFails(
      updateDoc(doc(db, 'events/event-a/crewLogistics/log-tech'), { roomNumber: '999' }),
    );
    await assertFails(deleteDoc(doc(db, 'events/event-a/crewLogistics/log-tech')));
  });

  it('forged eventContactId (no such attachment) is denied', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/crewLogistics/new-4'), {
        ...validLodging(),
        eventContactId: 'attach-forged',
      }),
    );
  });

  it('contactId that mismatches the attachment is denied', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/crewLogistics/new-5'), {
        ...validLodging(),
        contactId: 'contact-nolink', // attach-tech actually references contact-tech
      }),
    );
  });

  it("userId that mismatches the contact's CURRENT link is denied — the forged-grant case", async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/crewLogistics/new-6'), {
        ...validLodging(),
        userId: OUTSIDER, // contact-tech is linked to TECH
      }),
    );
    // …and the unlinked contact must carry null, not some uid.
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/crewLogistics/new-7'), {
        ...validLodging(),
        eventContactId: 'attach-nolink',
        contactId: 'contact-nolink',
        userId: TECH,
      }),
    );
  });

  it('malformed shapes are denied: unknown key, inverted dates, instant without zone', async () => {
    const db = dbFor(PM);
    await assertFails(
      setDoc(doc(db, 'events/event-a/crewLogistics/new-8'), {
        ...validLodging(),
        roomRate: 129,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'events/event-a/crewLogistics/new-9'), {
        ...validLodging(),
        checkInDate: '2026-07-12',
        checkOutDate: '2026-07-09',
      }),
    );
    await assertFails(
      setDoc(doc(db, 'events/event-a/crewLogistics/new-10'), {
        kind: 'travel',
        eventContactId: 'attach-tech',
        contactId: 'contact-tech',
        userId: TECH,
        mode: 'flight',
        departAt: new Date('2026-07-09T14:00:00Z'),
        departTimeZone: null, // instant without its zone
        createdBy: PM,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('updates cannot rewrite createdBy/createdAt', async () => {
    await assertFails(
      updateDoc(doc(dbFor(PM), 'events/event-a/crewLogistics/log-tech'), {
        createdBy: ADMIN.uid,
      }),
    );
  });
});

describe('contact link immutability + server-only detach (decisions 12/13 enforcement)', () => {
  it('EVERY direct client write is denied a userId rewrite — including admin and director', async () => {
    await assertFails(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/contact-tech'), {
        userId: OUTSIDER,
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor(DIRECTOR.uid, DIRECTOR.token), 'contacts/contact-tech'), {
        userId: OUTSIDER,
      }),
    );
    await assertFails(updateDoc(doc(dbFor(TECH), 'contacts/contact-tech'), { userId: null }));
  });

  it('admin still edits ordinary contact fields — only the link fields froze', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/contact-tech'), {
        name: 'Terry T. Tech',
      }),
    );
  });

  it('roster detach is server-only: even the PM cannot delete an attachment directly', async () => {
    await assertFails(deleteDoc(doc(dbFor(PM), 'events/event-a/contacts/attach-tech')));
    await assertFails(
      deleteDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/contacts/attach-tech')),
    );
  });
});
