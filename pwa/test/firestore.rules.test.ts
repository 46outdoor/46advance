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
const ORGANIZER = { uid: 'user-org', token: { organizer: true } }; // global event creator
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
    await setDoc(doc(db, 'events/event-a'), { name: 'Event A', status: 'active', createdBy: 'admin-1' });
    await setDoc(doc(db, 'events/event-b'), { name: 'Event B', status: 'active', createdBy: 'admin-1' });
    await setDoc(doc(db, 'events/event-a/members', PM), { role: 'production-manager', addedBy: 'admin-1', uid: PM });
    await setDoc(doc(db, 'events/event-b/members', PM), { role: 'tech', addedBy: 'admin-1', uid: PM });
    await setDoc(doc(db, 'events/event-a/members', LEAD), { role: 'department-lead', addedBy: 'admin-1', uid: LEAD });
    await setDoc(doc(db, 'events/event-a/members', TECH), { role: 'tech', addedBy: 'admin-1', uid: TECH });
    await setDoc(doc(db, 'users', PM), { email: 'pm@x.com', isAdmin: false });
    await setDoc(doc(db, 'users', OUTSIDER), { email: 'out@x.com', isAdmin: false });
    await setDoc(doc(db, 'events/event-a/flags/seed'), { createdBy: LEAD, text: 'seed' });
    // A stage on event A with an advance under it, for read/write tests.
    await setDoc(doc(db, 'events/event-a/stages/stg-a'), { name: 'Main', order: 0 });
    await setDoc(doc(db, 'events/event-a/stages/stg-a/advances/adv-1'), {
      artistName: 'Seed Band',
      createdBy: PM,
      sections: { audio: { status: 'in_progress', finalizedAt: null, finalizedBy: null } },
    });
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

  it('only admin can delete events', async () => {
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

describe('firestore.rules — event creation (global capability)', () => {
  const newEvent = (createdBy: string) => ({
    name: 'New Fest',
    status: 'draft',
    createdBy,
  });

  it('an organizer can create an event they own', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/evt-org'), newEvent(ORGANIZER.uid)));
  });

  it('admin can create an event', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/evt-adm'), newEvent(ADMIN.uid)));
  });

  it('a plain signed-in user (no organizer claim) cannot create events', async () => {
    await assertFails(setDoc(doc(dbFor(OUTSIDER), 'events/evt-no'), newEvent(OUTSIDER)));
  });

  it('cannot create an event owned by someone else', async () => {
    await assertFails(setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/evt-spoof'), newEvent('someone-else')));
  });

  it('rejects an invalid status', async () => {
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/evt-bad'), {
        name: 'X',
        status: 'live',
        createdBy: ORGANIZER.uid,
      }),
    );
  });
});

describe('firestore.rules — creator self-bootstrap as production-manager', () => {
  it('the event creator may add themselves as PM', async () => {
    const db = dbFor(ORGANIZER.uid, ORGANIZER.token);
    await assertSucceeds(setDoc(doc(db, 'events/evt-mine'), { name: 'Mine', status: 'draft', createdBy: ORGANIZER.uid }));
    await assertSucceeds(
      setDoc(doc(db, 'events/evt-mine/members', ORGANIZER.uid), {
        role: 'production-manager',
        addedBy: ORGANIZER.uid,
        uid: ORGANIZER.uid,
      }),
    );
  });

  it('cannot self-bootstrap PM on an event you did not create', async () => {
    // event-a was created by admin-1, not the organizer.
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/event-a/members', ORGANIZER.uid), {
        role: 'production-manager',
        addedBy: ORGANIZER.uid,
        uid: ORGANIZER.uid,
      }),
    );
  });

  it('cannot self-bootstrap a non-PM role (e.g. grant yourself tech everywhere)', async () => {
    const db = dbFor(ORGANIZER.uid, ORGANIZER.token);
    await assertSucceeds(setDoc(doc(db, 'events/evt-mine2'), { name: 'Mine2', status: 'draft', createdBy: ORGANIZER.uid }));
    await assertFails(
      setDoc(doc(db, 'events/evt-mine2/members', ORGANIZER.uid), {
        role: 'tech',
        addedBy: ORGANIZER.uid,
        uid: ORGANIZER.uid,
      }),
    );
  });
});

describe('firestore.rules — advances', () => {
  const newAdvance = (createdBy: string) => ({
    artistName: 'Act',
    createdBy,
    sections: {},
  });

  it('any member can read advances; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1')));
    await assertSucceeds(getDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/advances/adv-1')));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/stages/stg-a/advances/adv-1')));
  });

  it('production-manager + admin can create advances', async () => {
    await assertSucceeds(setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-pm'), newAdvance(PM)));
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/stages/stg-a/advances/adv-adm'), newAdvance(ADMIN.uid)),
    );
  });

  it('tech and department-lead cannot create advances', async () => {
    await assertFails(setDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-t'), newAdvance(TECH)));
    await assertFails(setDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/advances/adv-l'), newAdvance(LEAD)));
  });

  it('cannot forge another user as the advance creator', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-forge'), newAdvance('someone-else')));
  });
});

describe('firestore.rules — section finalize/unlock (write gate)', () => {
  const finalize = { sections: { audio: { status: 'complete', finalizedAt: null, finalizedBy: PM } } };

  it('production-manager can finalize a section (update the advance)', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1'), finalize));
  });

  it('admin can finalize/unlock', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/stages/stg-a/advances/adv-1'), {
        sections: { audio: { status: 'complete', finalizedAt: null, finalizedBy: ADMIN.uid } },
      }),
    );
  });

  it('tech and department-lead cannot change section status', async () => {
    await assertFails(updateDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1'), finalize));
    await assertFails(updateDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/advances/adv-1'), finalize));
  });

  it('only PM/admin can delete advances', async () => {
    await assertFails(deleteDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1')));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1')));
  });
});

describe('firestore.rules — stages', () => {
  it('any member can read a stage; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a')));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/stages/stg-a')));
  });

  it('production-manager + admin can create/update/delete stages', async () => {
    await assertSucceeds(setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-pm'), { name: 'PM Stage', order: 1 }));
    await assertSucceeds(updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/stages/stg-a'), { name: 'Renamed' }));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a')));
  });

  it('tech and department-lead cannot write stages', async () => {
    await assertFails(setDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-t'), { name: 'no', order: 9 }));
    await assertFails(setDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-l'), { name: 'no', order: 9 }));
  });
});

describe('firestore.rules — departments (app-wide config)', () => {
  it('any signed-in user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'departments/audio')));
    await assertFails(getDoc(doc(dbAnon(), 'departments/audio')));
  });

  it('only admin can write departments', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'departments/audio'), { name: 'Audio', order: 0 }));
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'departments/audio'), { name: 'Audio', order: 0 }),
    );
  });
});
