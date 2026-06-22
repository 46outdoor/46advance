import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url));

let testEnv: RulesTestEnvironment;

// Actors
const ADMIN = { uid: 'admin-1', token: { admin: true } };
const PM = 'user-pm'; // production-manager on event A, tech on event B
const LEAD = 'user-lead'; // department-lead on event A
const TECH = 'user-tech'; // tech on event A
const OUTSIDER = 'user-out'; // member of nothing

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
  // Seed baseline data with rules bypassed.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'events/event-a'), { name: 'Event A' });
    await setDoc(doc(db, 'events/event-b'), { name: 'Event B' });
    await setDoc(doc(db, 'events/event-a/members', PM), { role: 'production-manager', addedBy: 'admin-1' });
    await setDoc(doc(db, 'events/event-b/members', PM), { role: 'tech', addedBy: 'admin-1' });
    await setDoc(doc(db, 'events/event-a/members', LEAD), { role: 'department-lead', addedBy: 'admin-1' });
    await setDoc(doc(db, 'events/event-a/members', TECH), { role: 'tech', addedBy: 'admin-1' });
    await setDoc(doc(db, 'users', PM), { email: 'pm@x.com', isAdmin: false });
    await setDoc(doc(db, 'users', OUTSIDER), { email: 'out@x.com', isAdmin: false });
    await setDoc(doc(db, 'events/event-a/flags/seed'), { createdBy: LEAD, text: 'seed' });
  });
});

// Convenience: a Firestore handle for a given actor.
const dbFor = (uid: string, token?: Record<string, unknown>) =>
  testEnv.authenticatedContext(uid, token).firestore();
const dbAnon = () => testEnv.unauthenticatedContext().firestore();

describe('firestore.rules — the multi-event exit scenario', () => {
  it('production-manager can read AND update event A (their PM event)', async () => {
    const db = dbFor(PM);
    await assertSucceeds(getDoc(doc(db, 'events/event-a')));
    await assertSucceeds(updateDoc(doc(db, 'events/event-a'), { name: 'Event A — edited' }));
  });

  it('the same user can read event B but NOT update it (tech there)', async () => {
    const db = dbFor(PM);
    await assertSucceeds(getDoc(doc(db, 'events/event-b')));
    await assertFails(updateDoc(doc(db, 'events/event-b'), { name: 'nope' }));
  });
});

describe('firestore.rules — events read/write by role', () => {
  it('non-member cannot read an event', async () => {
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a')));
  });

  it('anonymous cannot read an event', async () => {
    await assertFails(getDoc(doc(dbAnon(), 'events/event-a')));
  });

  it('tech can read but not update', async () => {
    const db = dbFor(TECH);
    await assertSucceeds(getDoc(doc(db, 'events/event-a')));
    await assertFails(updateDoc(doc(db, 'events/event-a'), { name: 'x' }));
  });

  it('department-lead can read but not update (v1)', async () => {
    const db = dbFor(LEAD);
    await assertSucceeds(getDoc(doc(db, 'events/event-a')));
    await assertFails(updateDoc(doc(db, 'events/event-a'), { name: 'x' }));
  });

  it('only admin can create/delete events', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'events/new-1'), { name: 'pm-made' }));
    await assertSucceeds(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/new-1'), { name: 'admin-made' }));
    await assertFails(deleteDoc(doc(dbFor(PM), 'events/event-a')));
    await assertSucceeds(deleteDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-b')));
  });

  it('admin can read and update any event', async () => {
    const db = dbFor(ADMIN.uid, ADMIN.token);
    await assertSucceeds(getDoc(doc(db, 'events/event-a')));
    await assertSucceeds(updateDoc(doc(db, 'events/event-a'), { name: 'admin-edit' }));
  });
});

describe('firestore.rules — users', () => {
  it('a user can read their own profile but not another user’s', async () => {
    const db = dbFor(PM);
    await assertSucceeds(getDoc(doc(db, 'users', PM)));
    await assertFails(getDoc(doc(db, 'users', OUTSIDER)));
  });

  it('admin can read any profile', async () => {
    await assertSucceeds(getDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'users', PM)));
  });

  it('clients cannot write profiles (server-managed)', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'users', PM), { isAdmin: true }));
    await assertFails(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'users', PM), { isAdmin: true }));
  });
});

describe('firestore.rules — membership subcollection', () => {
  it('a member can read their own membership row', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/members', TECH)));
  });

  it('a member can read the roster of their event', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/members', PM)));
  });

  it('a non-member cannot read membership', async () => {
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/members', PM)));
  });

  it('only admin can write membership', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'events/event-a/members', 'x'), { role: 'tech', addedBy: PM }));
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/members', 'x'), {
        role: 'tech',
        addedBy: 'admin-1',
      }),
    );
  });
});

describe('firestore.rules — flags (canFlag)', () => {
  it('department-lead can create a flag (authored by self)', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(LEAD), 'events/event-a/flags/f-lead'), { createdBy: LEAD, text: 'hi' }),
    );
  });

  it('production-manager can create a flag', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/flags/f-pm'), { createdBy: PM, text: 'hi' }),
    );
  });

  it('tech cannot create a flag', async () => {
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/flags/f-tech'), { createdBy: TECH, text: 'no' }),
    );
  });

  it('cannot forge another user as the flag author', async () => {
    await assertFails(
      setDoc(doc(dbFor(LEAD), 'events/event-a/flags/f-forge'), { createdBy: PM, text: 'forged' }),
    );
  });

  it('members can read flags; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/flags/seed')));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/flags/seed')));
  });
});
