import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url));

let testEnv: RulesTestEnvironment;

// Actors
const ADMIN = { uid: 'admin-1', token: { admin: true } };
const ORGANIZER = { uid: 'user-org', token: { organizer: true, approved: true } }; // global event creator
const PM = 'user-pm'; // production-manager on event A, tech on event B
const LEAD = 'user-lead'; // department-lead on event A
const TECH = 'user-tech'; // tech on event A
const OUTSIDER = 'user-out'; // approved, but member of nothing
const PENDING = 'user-pending'; // approved:false — a member awaiting approval / revoked

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
    // A member doc exists for a not-yet-approved (or revoked) user — approval, not
    // membership, is what unlocks access (see the approved-user-gate suite).
    await setDoc(doc(db, 'events/event-a/members', PENDING), { role: 'tech', addedBy: 'admin-1', uid: PENDING });
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
    // Google (Phase 11b): a connection status doc + server-only token/state docs.
    await setDoc(doc(db, 'googleConnections', PM), { connected: true, email: 'pm@x.com' });
    await setDoc(doc(db, 'googleTokens', PM), { refreshToken: 'secret-refresh' });
    await setDoc(doc(db, 'googleOAuthStates/state-1'), { uid: PM });
    // Booked-call inbox under event A (server-synced; PM/admin resolve).
    await setDoc(doc(db, 'events/event-a/callBookings/cal-evt-1'), {
      calendarEventId: 'cal-evt-1',
      artistName: 'jelly roll',
      status: 'needs_review',
    });
  });
});

// Convenience: a Firestore handle for a given actor. Real members are approved
// users, so the token defaults to an approved claim — this keeps the role-based
// suites modeling production. Pending/revoked actors pass an explicit
// { approved: false } (or an empty token) to exercise the active-user gate.
const dbFor = (uid: string, token: Record<string, unknown> = { approved: true }) =>
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

describe('firestore.rules — approved-user gate (pending/revoked lockout)', () => {
  // A signed-in account an admin has not approved (or has revoked): approved:false.
  // PENDING is seeded as a tech member of event A, so these tests prove that
  // approval — not membership — is what unlocks access.
  const dbPending = () => dbFor(PENDING, { approved: false });
  // A signed-in account whose claims have never synced (no `approved` field at all).
  const dbNoClaim = () => dbFor('user-noclaim', {});

  it('a pending user cannot read app-wide config (departments/templates/contacts)', async () => {
    await assertFails(getDoc(doc(dbPending(), 'departments/audio')));
    await assertFails(getDoc(doc(dbPending(), 'templates/tpl-1')));
    await assertFails(getDoc(doc(dbPending(), 'contacts/c-anything')));
  });

  it('a signed-in user with no approved claim at all is treated as pending', async () => {
    await assertFails(getDoc(doc(dbNoClaim(), 'departments/audio')));
  });

  it('a pending event member cannot read event documents (event/stage/advance)', async () => {
    await assertFails(getDoc(doc(dbPending(), 'events/event-a')));
    await assertFails(getDoc(doc(dbPending(), 'events/event-a/stages/stg-a')));
    await assertFails(getDoc(doc(dbPending(), 'events/event-a/stages/stg-a/advances/adv-1')));
  });

  it('a revoked (approved:false) member loses write access too', async () => {
    await assertFails(
      setDoc(doc(dbPending(), 'contacts/c-pending'), { name: 'X', createdBy: PENDING }),
    );
  });

  it('an organizer who is not approved cannot create events', async () => {
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, { organizer: true, approved: false }), 'events/evt-pending'), {
        name: 'Nope',
        status: 'draft',
        createdBy: ORGANIZER.uid,
      }),
    );
  });

  it('an approved user with no event membership reads app-wide config but not events', async () => {
    // OUTSIDER is approved (default token) but a member of nothing.
    await assertSucceeds(getDoc(doc(dbFor(OUTSIDER), 'departments/audio')));
    await assertSucceeds(getDoc(doc(dbFor(OUTSIDER), 'templates/tpl-1')));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a')));
  });

  it('admin (no approved claim) is exempt from the gate', async () => {
    const db = dbFor(ADMIN.uid, ADMIN.token);
    await assertSucceeds(getDoc(doc(db, 'departments/audio')));
    await assertSucceeds(getDoc(doc(db, 'events/event-a')));
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

  it('a revoked (approved:false) member cannot read even their OWN membership row (F-7)', async () => {
    // PENDING is a seeded member of event-a, but a revoked account is blocked from ALL app
    // data — the own-membership read path requires isActiveUser(), not just sign-in.
    await assertFails(getDoc(doc(dbFor(PENDING, { approved: false }), 'events/event-a/members', PENDING)));
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

// The non-admin events list (events-service.listEvents) discovers a user's events with
// `collectionGroup('members').where('uid','==', me)`. A doc-id-only read rule denies that
// field-filtered collection-group list, so the `uid`-field read clause must authorize it —
// scoped to the caller's own rows and no one else's.
describe('firestore.rules — membership collection-group listing (events-list query)', () => {
  const membersFor = (uid: string) =>
    query(collectionGroup(dbFor(uid), 'members'), where('uid', '==', uid));

  it('a member can list their own membership rows across every event', async () => {
    // PM is seeded on event A (PM) and event B (tech) → both rows come back.
    const snap = await assertSucceeds(getDocs(membersFor(PM)));
    expect(snap.size).toBe(2);
  });

  it('an approved user with no memberships gets an empty (but allowed) list', async () => {
    const snap = await assertSucceeds(getDocs(membersFor(OUTSIDER)));
    expect(snap.size).toBe(0);
  });

  it('cannot list another user’s memberships via the collection-group query', async () => {
    await assertFails(getDocs(query(collectionGroup(dbFor(PM), 'members'), where('uid', '==', TECH))));
  });

  it('an unscoped collection-group members query (no uid filter) is denied', async () => {
    await assertFails(getDocs(query(collectionGroup(dbFor(PM), 'members'))));
  });

  it('an anonymous user cannot run the membership collection-group query', async () => {
    await assertFails(getDocs(query(collectionGroup(dbAnon(), 'members'), where('uid', '==', PM))));
  });

  it('a revoked (approved:false) user cannot list even their own membership rows (F-7)', async () => {
    // PENDING is seeded on event-a; the events-list query is gated on isActiveUser(), so a
    // revoked account can no longer enumerate which events it belongs to.
    await assertFails(
      getDocs(query(collectionGroup(dbFor(PENDING, { approved: false }), 'members'), where('uid', '==', PENDING))),
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

describe('firestore.rules — event creation is server-only (S8)', () => {
  const newEvent = (createdBy: string) => ({ name: 'New Fest', status: 'draft', createdBy });

  it('no client can create an event directly — only the createBlankEvent/template callables', async () => {
    await assertFails(setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/evt-org'), newEvent(ORGANIZER.uid)));
    await assertFails(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/evt-adm'), newEvent(ADMIN.uid)));
    await assertFails(setDoc(doc(dbFor(OUTSIDER), 'events/evt-no'), newEvent(OUTSIDER)));
  });
});

describe('firestore.rules — creator membership is server-only (S8)', () => {
  it('a user cannot self-bootstrap a PM membership — createBlankEvent adds it server-side', async () => {
    // No client self-bootstrap: a removed creator can't recreate a PM membership (WS-B).
    // (event-a was created by admin-1.)
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/event-a/members', ORGANIZER.uid), {
        role: 'production-manager',
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

  it('section content edits ride the same gate (PM yes, tech no)', async () => {
    const content = { content: { audio: { foh_console: 'X-32' } } };
    await assertSucceeds(updateDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1'), content));
    await assertFails(updateDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1'), content));
  });
});

describe('firestore.rules — advance driveFiles subcollection (server-owned, Phase 13)', () => {
  const dfPath = (f: string) => `events/event-a/stages/stg-a/advances/adv-1/driveFiles/${f}`;
  const entry = { fileId: 'f1', name: 'Plot.pdf', webViewLink: 'https://drive.google.com/x', linkedByUid: PM };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), dfPath('f1')), entry);
    });
  });

  it('members read linked Drive files; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), dfPath('f1'))));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), dfPath('f1'))));
  });

  it('clients (even PM/admin) cannot write/delete Drive file links — server-only', async () => {
    await assertFails(setDoc(doc(dbFor(PM), dfPath('f2')), { ...entry, fileId: 'f2' }));
    await assertFails(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), dfPath('f2')), { ...entry, fileId: 'f2' }));
    await assertFails(deleteDoc(doc(dbFor(PM), dfPath('f1'))));
  });

  it('an advance update still succeeds (driveFiles is no longer an advance field)', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1'), { notes: 'hi' }));
  });
});

describe('firestore.rules — quotes (under an advance)', () => {
  const quotePath = (q: string) => `events/event-a/stages/stg-a/advances/adv-1/quotes/${q}`;
  const newQuote = (createdBy: string) => ({ title: 'Backline', status: 'draft', createdBy });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), quotePath('q-seed')), { title: 'Seed', status: 'sent', createdBy: PM });
    });
  });

  it('any member can read quotes; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), quotePath('q-seed'))));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), quotePath('q-seed'))));
  });

  it('PM + admin can create quotes (authored by self)', async () => {
    await assertSucceeds(setDoc(doc(dbFor(PM), quotePath('q-pm')), newQuote(PM)));
    await assertSucceeds(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), quotePath('q-adm')), newQuote(ADMIN.uid)));
  });

  it('tech and department-lead cannot create quotes', async () => {
    await assertFails(setDoc(doc(dbFor(TECH), quotePath('q-t')), newQuote(TECH)));
    await assertFails(setDoc(doc(dbFor(LEAD), quotePath('q-l')), newQuote(LEAD)));
  });

  it('cannot forge another user as the quote creator', async () => {
    await assertFails(setDoc(doc(dbFor(PM), quotePath('q-forge')), newQuote('someone-else')));
  });

  it('PM can approve (update status); tech cannot', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), quotePath('q-seed')), { status: 'approved', decisionBy: PM }),
    );
    await assertFails(
      updateDoc(doc(dbFor(TECH), quotePath('q-seed')), { status: 'approved', decisionBy: TECH }),
    );
  });

  it('only PM/admin can delete quotes', async () => {
    await assertFails(deleteDoc(doc(dbFor(TECH), quotePath('q-seed'))));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), quotePath('q-seed'))));
  });
});

describe('firestore.rules — document shape validation', () => {
  const advPath = 'events/event-a/stages/stg-a/advances/adv-1';
  const quotePath = (q: string) => `${advPath}/quotes/${q}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), quotePath('q-shape')), { title: 'Seed', status: 'sent', createdBy: PM });
    });
  });

  // events
  it('rejects an invalid event status on update; allows a valid one', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), 'events/event-a'), { status: 'live' }));
    await assertSucceeds(updateDoc(doc(dbFor(PM), 'events/event-a'), { status: 'archived' }));
  });

  it('blocks client writes to the server-owned googleCalendarId (create + update)', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), 'events/event-a'), { googleCalendarId: 'cal-x' }));
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/evt-cal'), {
        name: 'X',
        status: 'draft',
        createdBy: ORGANIZER.uid,
        googleCalendarId: 'cal-x',
      }),
    );
  });

  // advances
  it('rejects an advance with a blank or missing artistName', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-blank'), { artistName: '', createdBy: PM, sections: {} }),
    );
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-noname'), { createdBy: PM, sections: {} }),
    );
  });

  it('keeps advance.createdBy immutable', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), advPath), { createdBy: 'someone-else' }));
  });

  it('still allows attachBooking-style writes (call fields, NOT driveFiles)', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), advPath), {
        advanceCallAt: null,
        advanceCallLink: 'https://meet.google.com/abc',
        googleCalendarEventId: 'cal-evt-9',
      }),
    );
  });

  // quotes
  it('rejects an arbitrary quote status (create + update) and a blank title', async () => {
    await assertFails(setDoc(doc(dbFor(PM), quotePath('q-bad')), { title: 'X', status: 'pending', createdBy: PM }));
    await assertFails(updateDoc(doc(dbFor(PM), quotePath('q-shape')), { status: 'pending' }));
    await assertFails(setDoc(doc(dbFor(PM), quotePath('q-blank')), { title: '', status: 'draft', createdBy: PM }));
  });

  it('keeps quote.createdBy immutable', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), quotePath('q-shape')), { createdBy: 'someone-else' }));
  });

});

describe('firestore.rules — schedule days (redesign)', () => {
  const dayPath = 'events/event-a/scheduleDays/2026-07-14';
  const validDay = {
    date: '2026-07-14',
    dayType: 'loadIn',
    title: 'Stage Build Day 1',
    items: [],
    createdBy: PM,
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), dayPath), validDay);
    });
  });

  it('members read; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), dayPath)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), dayPath)));
  });

  it('PM creates a valid day; a tech (non-editor) cannot', async () => {
    const day = { ...validDay, date: '2026-07-15' };
    await assertSucceeds(setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/2026-07-15'), day));
    await assertFails(setDoc(doc(dbFor(TECH), 'events/event-a/scheduleDays/2026-07-16'), { ...validDay, date: '2026-07-16', createdBy: TECH }));
  });

  it('rejects a doc whose date does not match its id (one card per date is structural)', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/2026-07-15'), { ...validDay, date: '2026-07-16' }),
    );
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { date: '2026-07-20' }));
  });

  it('rejects a non-date id and an unknown dayType', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/day-one'), { ...validDay, date: 'day-one' }),
    );
    await assertFails(setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/2026-07-15'), { ...validDay, date: '2026-07-15', dayType: 'build' }));
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { dayType: 'strike' }));
  });

  it('requires items to be a list', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { items: 'none' }));
  });

  it('pins createdBy to the caller on create (audit field is not forgeable)', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/2026-07-17'), {
        ...validDay,
        date: '2026-07-17',
        createdBy: 'someone-else',
      }),
    );
  });

  it('allows the whole-day atomic overwrite the inline editor uses (createdBy carried through)', async () => {
    const items = [{ id: 'i1', type: 'labor', item: 'Load-In Call', startTime: '08:00', crew: [] }];
    await assertSucceeds(setDoc(doc(dbFor(PM), dayPath), { ...validDay, notes: 'Dock 2 only', items }));
    // A full overwrite that drops createdBy changes the audit field — rejected.
    await assertFails(setDoc(doc(dbFor(PM), dayPath), { date: '2026-07-14', dayType: 'loadIn', items }));
  });

  it('keeps day.createdBy immutable; PM can update and delete', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { createdBy: 'someone-else' }));
    await assertSucceeds(updateDoc(doc(dbFor(PM), dayPath), { notes: 'Dock 2 only until noon.' }));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), dayPath)));
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

describe('firestore.rules — production records', () => {
  it('event-level: members read, PM/admin write, tech cannot write', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/production/record')));
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/production/record'), { info: { crew_parking: 'Lot B' } }),
    );
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/production/record'), { info: { crew_parking: 'no' } }),
    );
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/production/record')));
  });

  it('stage-level: members read, PM/admin write, dept-lead cannot write', async () => {
    await assertSucceeds(getDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/production/record')));
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/production/record'), {
        content: { audio: { foh_console: 'DM7' } },
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/production/record'), {
        content: { audio: { foh_console: 'no' } },
      }),
    );
  });
});

describe('firestore.rules — production attachments subcollection', () => {
  const evAtt = (a: string) => `events/event-a/production/record/attachments/${a}`;
  const stAtt = (a: string) => `events/event-a/stages/stg-a/production/record/attachments/${a}`;
  const file = { name: 'plot.pdf', path: 'events/event-a/production/event/plot.pdf', url: 'https://x', uploadedBy: PM };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), evAtt('a1')), file);
      await setDoc(doc(ctx.firestore(), stAtt('a1')), file);
    });
  });

  it('event-level: members read, PM/admin write, tech cannot write, outsider cannot read', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), evAtt('a1'))));
    await assertSucceeds(setDoc(doc(dbFor(PM), evAtt('a2')), file));
    await assertFails(setDoc(doc(dbFor(TECH), evAtt('a3')), file));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), evAtt('a1'))));
  });

  it('stage-level: members read, PM/admin write, dept-lead cannot write', async () => {
    await assertSucceeds(getDoc(doc(dbFor(LEAD), stAtt('a1'))));
    await assertSucceeds(setDoc(doc(dbFor(PM), stAtt('a2')), file));
    await assertFails(setDoc(doc(dbFor(LEAD), stAtt('a3')), file));
  });

  it('PM can delete an attachment; tech cannot', async () => {
    await assertFails(deleteDoc(doc(dbFor(TECH), evAtt('a1'))));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), evAtt('a1'))));
  });
});

describe('firestore.rules — global contacts directory', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'contacts/c-pm'), { name: 'By PM', createdBy: PM });
      // A directory entry an admin created but linked to TECH's account (userId).
      await setDoc(doc(ctx.firestore(), 'contacts/c-linked'), { name: 'Tech', createdBy: 'admin-1', userId: TECH });
    });
  });

  it('any signed-in user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'contacts/c-pm')));
    await assertFails(getDoc(doc(dbAnon(), 'contacts/c-pm')));
  });

  it('a signed-in user can create a contact they author', async () => {
    await assertSucceeds(setDoc(doc(dbFor(TECH), 'contacts/c-tech'), { name: 'New', createdBy: TECH }));
  });

  it('cannot forge another user as the contact creator', async () => {
    await assertFails(setDoc(doc(dbFor(TECH), 'contacts/c-forge'), { name: 'X', createdBy: PM }));
  });

  it('the creator can edit/delete; a non-creator cannot', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(PM), 'contacts/c-pm'), { name: 'Edited' }));
    await assertFails(updateDoc(doc(dbFor(TECH), 'contacts/c-pm'), { name: 'Nope' }));
    await assertFails(deleteDoc(doc(dbFor(TECH), 'contacts/c-pm')));
  });

  it('admin can edit/delete any contact', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/c-pm'), { name: 'Admin edit' }));
  });

  it('a user can update the entry linked to their own account, but not delete it or others', async () => {
    // TECH owns the linked entry via userId — may update (e.g. their profile photo)…
    await assertSucceeds(updateDoc(doc(dbFor(TECH), 'contacts/c-linked'), { photo: { path: 'p', url: 'u' } }));
    // …but not delete it (delete stays creator/admin)…
    await assertFails(deleteDoc(doc(dbFor(TECH), 'contacts/c-linked')));
    // …and a non-linked, non-creator user cannot update it.
    await assertFails(updateDoc(doc(dbFor(OUTSIDER), 'contacts/c-linked'), { photo: { path: 'p', url: 'u' } }));
  });

  it('a linked user cannot rewrite createdBy to hijack ownership (F-3)', async () => {
    // TECH may update c-linked (linked via userId), but seizing createdBy would then unlock the
    // creator-only delete — createdBy is immutable to ordinary clients.
    await assertFails(updateDoc(doc(dbFor(TECH), 'contacts/c-linked'), { createdBy: TECH }));
  });

  it('a linked user cannot repoint the userId link', async () => {
    await assertFails(updateDoc(doc(dbFor(TECH), 'contacts/c-linked'), { userId: OUTSIDER }));
  });

  it('the creator cannot change createdBy or add a userId link via the client', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), 'contacts/c-pm'), { createdBy: OUTSIDER }));
    await assertFails(updateDoc(doc(dbFor(PM), 'contacts/c-pm'), { userId: PM }));
  });

  it('admin can relink a contact (createdBy/userId stay admin-mutable)', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/c-linked'), { userId: PM }));
    await assertSucceeds(updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/c-pm'), { createdBy: OUTSIDER }));
  });
});

describe('firestore.rules — per-event contact attachments', () => {
  const attachPath = (a: string) => `events/event-a/contacts/${a}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), attachPath('att-seed')), { contactId: 'c-pm', roleLabel: 'SM', addedBy: PM });
    });
  });

  it('members read attachments; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), attachPath('att-seed'))));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), attachPath('att-seed'))));
  });

  it('PM/admin can attach; tech/lead cannot', async () => {
    await assertSucceeds(setDoc(doc(dbFor(PM), attachPath('att-pm')), { contactId: 'c-pm', addedBy: PM }));
    await assertFails(setDoc(doc(dbFor(TECH), attachPath('att-t')), { contactId: 'c-pm', addedBy: TECH }));
    await assertFails(setDoc(doc(dbFor(LEAD), attachPath('att-l')), { contactId: 'c-pm', addedBy: LEAD }));
  });

  it('only PM/admin can detach', async () => {
    await assertFails(deleteDoc(doc(dbFor(TECH), attachPath('att-seed'))));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), attachPath('att-seed'))));
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

describe('firestore.rules — documentCategories (app-wide config)', () => {
  it('any signed-in user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'documentCategories/tech-rider')));
    await assertFails(getDoc(doc(dbAnon(), 'documentCategories/tech-rider')));
  });

  it('only admin can write document categories', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'documentCategories/tech-rider'), { name: 'Tech Rider', order: 0 }));
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'documentCategories/tech-rider'), { name: 'Tech Rider', order: 0 }),
    );
  });
});

describe('firestore.rules — artistDocuments (library)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'artistDocuments/doc-1'), {
        fileId: 'doc-1',
        name: 'Rider.pdf',
        webViewLink: 'https://drive/x',
        importedBy: 'admin-1',
        artistKey: 'jelly roll',
        categoryId: null,
      });
    });
  });

  it('any approved user reads; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'artistDocuments/doc-1')));
    await assertFails(getDoc(doc(dbAnon(), 'artistDocuments/doc-1')));
  });

  it('admin + organizer classify; tech cannot', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'artistDocuments/doc-1'), { categoryId: 'tech-rider' }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'artistDocuments/doc-1'), { categoryId: 'media' }),
    );
    await assertFails(updateDoc(doc(dbFor(TECH), 'artistDocuments/doc-1'), { categoryId: 'media' }));
  });

  it('trusted Drive source metadata is immutable to clients — only classification/annotation may change (F-3)', async () => {
    const ref = doc(dbFor(ADMIN.uid, ADMIN.token), 'artistDocuments/doc-1');
    // Curation still works: (re)classify, rename the display label, annotate, mark verified.
    await assertSucceeds(
      updateDoc(ref, { categoryId: 'tech-rider', displayName: 'Rider (final)', verifiedAt: serverTimestamp() }),
    );
    // The canonical source fields the callable recorded cannot be rewritten client-side —
    // else a client could repoint the name/link/provenance to a file it never proved (F-1/F-3).
    await assertFails(updateDoc(ref, { webViewLink: 'https://evil/phish' }));
    await assertFails(updateDoc(ref, { name: 'Swapped.pdf' }));
    await assertFails(updateDoc(ref, { fileId: 'other-file' }));
    await assertFails(updateDoc(ref, { artistKey: 'someone-else' }));
    await assertFails(updateDoc(ref, { sourceFolderId: 'attacker-folder' }));
  });

  it('client create is denied — records come only from the registerArtistDocument callable (S8)', async () => {
    const upload = (fileId: string, over: Record<string, unknown> = {}) => ({
      fileId,
      name: 'Uploaded.pdf',
      webViewLink: 'https://drive/y',
      importedBy: ADMIN.uid,
      ...over,
    });
    // Even admin/organizer can no longer client-create — provenance is verified server-side.
    await assertFails(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'artistDocuments/up-1'), upload('up-1')));
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'artistDocuments/up-2'), upload('up-2', { importedBy: ORGANIZER.uid })),
    );
    await assertFails(setDoc(doc(dbFor(TECH), 'artistDocuments/up-5'), upload('up-5', { importedBy: TECH })));
  });
});

describe('firestore.rules — templates', () => {
  it('any signed-in user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'templates/tpl-1')));
    await assertFails(getDoc(doc(dbAnon(), 'templates/tpl-1')));
  });

  it('only admin can write templates', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'templates/tpl-1'), { name: 'X' }));
    await assertSucceeds(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'templates/tpl-1'), { name: 'X' }));
  });
});

describe('firestore.rules — config/branding', () => {
  it('any approved user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'config/branding')));
    await assertFails(getDoc(doc(dbAnon(), 'config/branding')));
  });

  it('a non-admin approved user cannot write branding config', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'config/branding'), { defaultLogos: [] }));
  });

  it('admin can write branding config', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'config/branding'), { defaultLogos: [] }),
    );
  });
});

describe('firestore.rules — Google connection (Phase 11b)', () => {
  it('owner reads their own connection status; another user cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(PM), 'googleConnections', PM)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'googleConnections', PM)));
  });

  it('admin can read any connection status', async () => {
    await assertSucceeds(getDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'googleConnections', PM)));
  });

  it('clients cannot write connection status (server-managed)', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'googleConnections', PM), { connected: false }));
    await assertFails(setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'googleConnections', PM), { connected: false }));
  });

  it('tokens are never client-readable or client-writable (even the owner / admin)', async () => {
    await assertFails(getDoc(doc(dbFor(PM), 'googleTokens', PM)));
    await assertFails(getDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'googleTokens', PM)));
    await assertFails(setDoc(doc(dbFor(PM), 'googleTokens', PM), { refreshToken: 'x' }));
  });

  it('OAuth state docs are server-only (no client read/write)', async () => {
    await assertFails(getDoc(doc(dbFor(PM), 'googleOAuthStates/state-1')));
    await assertFails(setDoc(doc(dbFor(PM), 'googleOAuthStates/state-2'), { uid: PM }));
  });
});

describe('firestore.rules — booked-call inbox (Phase 11b sync)', () => {
  const bookingPath = 'events/event-a/callBookings/cal-evt-1';

  it('any event member reads the inbox; a non-member cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), bookingPath)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), bookingPath)));
  });

  it('PM/admin can resolve (write); tech and dept-lead cannot', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(PM), bookingPath), { status: 'dismissed' }));
    await assertSucceeds(updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), bookingPath), { status: 'attached' }));
    await assertFails(updateDoc(doc(dbFor(TECH), bookingPath), { status: 'dismissed' }));
    await assertFails(updateDoc(doc(dbFor(LEAD), bookingPath), { status: 'dismissed' }));
  });
});

describe('firestore.rules — event documents', () => {
  const docPath = 'events/event-a/documents/efile-1';
  const validDoc = () => ({
    fileId: 'efile-1',
    name: 'SitePlan.pdf',
    webViewLink: 'https://drive/x',
    day: '2026-07-14',
    uploadedBy: PM,
    uploadedAt: serverTimestamp(),
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), docPath), validDoc());
    });
  });

  it('members read; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), docPath)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), docPath)));
  });

  it('client create is denied — records come only from the registerEventDocument callable (S8)', async () => {
    const at = (n: number) => `events/event-a/documents/efile-${n}`;
    // Even a PM can no longer client-create — folder membership is verified server-side.
    await assertFails(setDoc(doc(dbFor(PM), at(2)), { ...validDoc(), fileId: 'efile-2' }));
    await assertFails(setDoc(doc(dbFor(TECH), at(5)), { ...validDoc(), fileId: 'efile-5', uploadedBy: TECH }));
  });

  it('updates re-day/categorize/rename but keep audit + Drive source metadata immutable; PM deletes', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(PM), docPath), { day: null, categoryId: 'cat-1', displayName: 'Site plan' }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { uploadedBy: 'someone-else' }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { fileId: 'other' }));
    // Drive source metadata is server-recorded and immutable to clients (F-3).
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { name: 'Swapped.pdf' }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { webViewLink: 'https://evil/x' }));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), docPath)));
  });
});

describe('firestore.rules — advance documents (inclusion)', () => {
  const docPath = 'events/event-a/stages/stg-a/advances/adv-1/documents/file-1';
  const validDoc = () => ({
    fileId: 'file-1',
    name: 'Rider.pdf',
    webViewLink: 'https://drive/x',
    includePacket: false,
    addedBy: PM,
    addedAt: serverTimestamp(),
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), docPath), validDoc());
    });
  });

  it('members read; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), docPath)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), docPath)));
  });

  it('client create is denied — inclusions come only from the includeArtistDocumentOnAdvance callable (S8)', async () => {
    const at = (n: number) => `events/event-a/stages/stg-a/advances/adv-1/documents/file-${n}`;
    // Even a PM can no longer client-create — the callable copies canonical artistDocuments metadata.
    await assertFails(setDoc(doc(dbFor(PM), at(2)), { ...validDoc(), fileId: 'file-2' }));
    await assertFails(setDoc(doc(dbFor(TECH), at(4)), { ...validDoc(), fileId: 'file-4', addedBy: TECH }));
  });

  it('rejects a blank fileId or name, and a forged (non-server) addedAt, on create', async () => {
    const at = (n: number) => `events/event-a/stages/stg-a/advances/adv-1/documents/file-${n}`;
    await assertFails(setDoc(doc(dbFor(PM), at(5)), { ...validDoc(), fileId: '' }));
    await assertFails(setDoc(doc(dbFor(PM), at(6)), { ...validDoc(), fileId: 'file-6', name: '' }));
    await assertFails(
      setDoc(doc(dbFor(PM), at(7)), { ...validDoc(), fileId: 'file-7', addedAt: Timestamp.fromMillis(0) }),
    );
  });

  it('updates keep audit + Drive source metadata immutable; PM can toggle includePacket and delete', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(PM), docPath), { includePacket: true }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { addedBy: 'someone-else' }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { addedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { fileId: 'other' }));
    // The copied Drive source metadata is immutable to clients (F-3).
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { name: 'Swapped.pdf' }));
    await assertFails(updateDoc(doc(dbFor(PM), docPath), { webViewLink: 'https://evil/x' }));
    await assertFails(updateDoc(doc(dbFor(TECH), docPath), { includePacket: true }));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), docPath)));
  });
});

describe('contacts — create userId link', () => {
  const newContact = (extra: Record<string, unknown> = {}) => ({ name: 'Someone', createdBy: TECH, ...extra });

  it('an approved user can create an unlinked contact', async () => {
    await assertSucceeds(setDoc(doc(dbFor(TECH), 'contacts/c-unlinked'), newContact()));
  });

  it('a user can create a contact linked to their own account', async () => {
    await assertSucceeds(setDoc(doc(dbFor(TECH), 'contacts/c-self'), newContact({ userId: TECH })));
  });

  it('a user cannot create a contact spoofing a link to another account', async () => {
    await assertFails(setDoc(doc(dbFor(TECH), 'contacts/c-spoof'), newContact({ userId: PM })));
  });
});
