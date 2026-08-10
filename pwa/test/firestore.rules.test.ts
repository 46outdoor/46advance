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
const LEAD = 'user-lead'; // department-lead on event A (no departments assigned — read-only)
const DEPT = 'user-dept'; // department-lead on event A assigned departments: ['audio']
const TECH = 'user-tech'; // tech on event A
const OUTSIDER = 'user-out'; // approved, but member of nothing
const PENDING = 'user-pending'; // approved:false — a member awaiting approval / revoked

// Cross-event oversight (planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md). The claim is global and
// read-only; DIRECTOR holds NO membership anywhere. The combined identities prove that
// capabilities are additive (director + PM writes only where the PM row is) and that a
// lower per-event role never downgrades the global read (director + tech).
const DIRECTOR = { uid: 'user-director', token: { approved: true, productionDirector: true } };
const DIRECTOR_PM = { uid: 'user-dir-pm', token: { approved: true, productionDirector: true } };
const DIRECTOR_TECH = {
  uid: 'user-dir-tech',
  token: { approved: true, productionDirector: true },
};

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
    await setDoc(doc(db, 'events/event-a'), {
      name: 'Event A',
      status: 'active',
      createdBy: 'admin-1',
    });
    await setDoc(doc(db, 'events/event-b'), {
      name: 'Event B',
      status: 'active',
      createdBy: 'admin-1',
    });
    await setDoc(doc(db, 'events/event-a/members', PM), {
      role: 'production-manager',
      addedBy: 'admin-1',
      uid: PM,
    });
    await setDoc(doc(db, 'events/event-b/members', PM), {
      role: 'tech',
      addedBy: 'admin-1',
      uid: PM,
    });
    await setDoc(doc(db, 'events/event-a/members', LEAD), {
      role: 'department-lead',
      addedBy: 'admin-1',
      uid: LEAD,
    });
    await setDoc(doc(db, 'events/event-a/members', DEPT), {
      role: 'department-lead',
      addedBy: 'admin-1',
      uid: DEPT,
      departments: ['audio'],
    });
    await setDoc(doc(db, 'events/event-a/members', TECH), {
      role: 'tech',
      addedBy: 'admin-1',
      uid: TECH,
    });
    // A member doc exists for a not-yet-approved (or revoked) user — approval, not
    // membership, is what unlocks access (see the approved-user-gate suite).
    await setDoc(doc(db, 'events/event-a/members', PENDING), {
      role: 'tech',
      addedBy: 'admin-1',
      uid: PENDING,
    });
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
    // Event checklist (PM-only surface) + an admin-managed checklist template.
    await setDoc(doc(db, 'events/event-a/checklist/chk-1'), {
      text: 'Book crew bus',
      section: 'main',
      order: 0,
      completedAt: null,
    });
    await setDoc(doc(db, 'checklistTemplates/ctpl-1'), {
      name: 'Standard show',
      items: [{ text: 'Confirm power', section: 'main' }],
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
      setDoc(
        doc(dbFor(ORGANIZER.uid, { organizer: true, approved: false }), 'events/evt-pending'),
        {
          name: 'Nope',
          status: 'draft',
          createdBy: ORGANIZER.uid,
        },
      ),
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
    await assertFails(
      getDoc(doc(dbFor(PENDING, { approved: false }), 'events/event-a/members', PENDING)),
    );
  });

  it('only admin can write membership', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/members', 'x'), { role: 'tech', addedBy: PM }),
    );
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
    await assertFails(
      getDocs(query(collectionGroup(dbFor(PM), 'members'), where('uid', '==', TECH))),
    );
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
      getDocs(
        query(
          collectionGroup(dbFor(PENDING, { approved: false }), 'members'),
          where('uid', '==', PENDING),
        ),
      ),
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
    await assertFails(
      setDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'events/evt-org'), newEvent(ORGANIZER.uid)),
    );
    await assertFails(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/evt-adm'), newEvent(ADMIN.uid)),
    );
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
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-pm'), newAdvance(PM)),
    );
    await assertSucceeds(
      setDoc(
        doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/stages/stg-a/advances/adv-adm'),
        newAdvance(ADMIN.uid),
      ),
    );
  });

  it('tech and department-lead cannot create advances', async () => {
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-t'), newAdvance(TECH)),
    );
    await assertFails(
      setDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/advances/adv-l'), newAdvance(LEAD)),
    );
  });

  it('cannot forge another user as the advance creator', async () => {
    await assertFails(
      setDoc(
        doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-forge'),
        newAdvance('someone-else'),
      ),
    );
  });
});

describe('firestore.rules — section finalize/unlock (write gate)', () => {
  const finalize = {
    sections: { audio: { status: 'complete', finalizedAt: null, finalizedBy: PM } },
  };

  it('production-manager can finalize a section (update the advance)', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1'), finalize),
    );
  });

  it('admin can finalize/unlock', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/stages/stg-a/advances/adv-1'), {
        sections: { audio: { status: 'complete', finalizedAt: null, finalizedBy: ADMIN.uid } },
      }),
    );
  });

  it('tech and department-lead cannot change section status', async () => {
    await assertFails(
      updateDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1'), finalize),
    );
    await assertFails(
      updateDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-a/advances/adv-1'), finalize),
    );
  });

  it('only PM/admin can delete advances', async () => {
    await assertFails(deleteDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1')));
    await assertSucceeds(deleteDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1')));
  });

  it('section content edits ride the same gate (PM yes, tech no)', async () => {
    const content = { content: { audio: { foh_console: 'X-32' } } };
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1'), content),
    );
    await assertFails(
      updateDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a/advances/adv-1'), content),
    );
  });
});

describe('firestore.rules — advance driveFiles subcollection (server-owned, Phase 13)', () => {
  const dfPath = (f: string) => `events/event-a/stages/stg-a/advances/adv-1/driveFiles/${f}`;
  const entry = {
    fileId: 'f1',
    name: 'Plot.pdf',
    webViewLink: 'https://drive.google.com/x',
    linkedByUid: PM,
  };

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
    await assertFails(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), dfPath('f2')), { ...entry, fileId: 'f2' }),
    );
    await assertFails(deleteDoc(doc(dbFor(PM), dfPath('f1'))));
  });

  it('an advance update still succeeds (driveFiles is no longer an advance field)', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-1'), { notes: 'hi' }),
    );
  });
});

describe('firestore.rules — quotes (under an advance)', () => {
  const quotePath = (q: string) => `events/event-a/stages/stg-a/advances/adv-1/quotes/${q}`;
  const newQuote = (createdBy: string) => ({ title: 'Backline', status: 'draft', createdBy });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), quotePath('q-seed')), {
        title: 'Seed',
        status: 'sent',
        createdBy: PM,
      });
    });
  });

  it('any member can read quotes; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), quotePath('q-seed'))));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), quotePath('q-seed'))));
  });

  it('PM + admin can create quotes (authored by self)', async () => {
    await assertSucceeds(setDoc(doc(dbFor(PM), quotePath('q-pm')), newQuote(PM)));
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), quotePath('q-adm')), newQuote(ADMIN.uid)),
    );
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
      await setDoc(doc(ctx.firestore(), quotePath('q-shape')), {
        title: 'Seed',
        status: 'sent',
        createdBy: PM,
      });
    });
  });

  // events
  it('rejects an invalid event status on update; allows a valid one', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), 'events/event-a'), { status: 'live' }));
    await assertSucceeds(updateDoc(doc(dbFor(PM), 'events/event-a'), { status: 'archived' }));
  });

  it('blocks direct event slug updates so reservations can only move through the callable', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), 'events/event-a'), { slug: 'duplicate-slug' }));
    await assertFails(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a'), {
        slug: 'admin-bypass-slug',
      }),
    );
  });

  // advances
  it('rejects an advance with a blank or missing artistName', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-blank'), {
        artistName: '',
        createdBy: PM,
        sections: {},
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-noname'), {
        createdBy: PM,
        sections: {},
      }),
    );
  });

  it('keeps advance.createdBy immutable', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), advPath), { createdBy: 'someone-else' }));
  });

  it('keeps Google Calendar linkage server-owned while allowing ordinary advance edits', async () => {
    await assertFails(
      updateDoc(doc(dbFor(PM), advPath), {
        advanceCallAt: null,
        advanceCallLink: 'https://meet.google.com/abc',
        googleCalendarEventId: 'cal-evt-9',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), advPath), {
        advanceCallAt: null,
        advanceCallLink: 'https://meet.google.com/abc',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-linked'), {
        artistName: 'Forged Link',
        createdBy: PM,
        googleCalendarEventId: 'cal-forged',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a/advances/adv-null-link'), {
        artistName: 'Explicit Null Link',
        createdBy: PM,
        googleCalendarEventId: null,
      }),
    );
  });

  // quotes
  it('rejects an arbitrary quote status (create + update) and a blank title', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), quotePath('q-bad')), { title: 'X', status: 'pending', createdBy: PM }),
    );
    await assertFails(updateDoc(doc(dbFor(PM), quotePath('q-shape')), { status: 'pending' }));
    await assertFails(
      setDoc(doc(dbFor(PM), quotePath('q-blank')), { title: '', status: 'draft', createdBy: PM }),
    );
  });

  it('keeps quote.createdBy immutable', async () => {
    await assertFails(
      updateDoc(doc(dbFor(PM), quotePath('q-shape')), { createdBy: 'someone-else' }),
    );
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
    revision: 0,
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
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/scheduleDays/2026-07-16'), {
        ...validDay,
        date: '2026-07-16',
        createdBy: TECH,
      }),
    );
  });

  it('requires a new schedule day to start at revision zero', async () => {
    const path = 'events/event-a/scheduleDays/2026-07-18';
    const day = { ...validDay, date: '2026-07-18' };
    await assertFails(
      setDoc(doc(dbFor(PM), path), {
        date: day.date,
        dayType: day.dayType,
        title: day.title,
        items: day.items,
        createdBy: day.createdBy,
      }),
    );
    await assertFails(setDoc(doc(dbFor(PM), path), { ...day, revision: 4 }));
    await assertSucceeds(setDoc(doc(dbFor(PM), path), day));
  });

  it('rejects a doc whose date does not match its id (one card per date is structural)', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/2026-07-15'), {
        ...validDay,
        date: '2026-07-16',
      }),
    );
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { date: '2026-07-20' }));
  });

  it('rejects a non-date id and an unknown dayType', async () => {
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/day-one'), {
        ...validDay,
        date: 'day-one',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/scheduleDays/2026-07-15'), {
        ...validDay,
        date: '2026-07-15',
        dayType: 'build',
      }),
    );
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
    await assertSucceeds(
      setDoc(doc(dbFor(PM), dayPath), { ...validDay, notes: 'Dock 2 only', items, revision: 1 }),
    );
    // A full overwrite that drops createdBy changes the audit field — rejected.
    await assertFails(
      setDoc(doc(dbFor(PM), dayPath), { date: '2026-07-14', dayType: 'loadIn', items }),
    );
  });

  it('keeps day.createdBy immutable; PM can update and delete', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { createdBy: 'someone-else' }));
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), dayPath), { notes: 'Dock 2 only until noon.', revision: 1 }),
    );
    await assertSucceeds(deleteDoc(doc(dbFor(PM), dayPath)));
  });

  it('optimistic-concurrency: a revision write must increment by exactly 1 (WS-G)', async () => {
    // Seed doc has no revision → treated as 0; the next write must be 1.
    await assertSucceeds(updateDoc(doc(dbFor(PM), dayPath), { revision: 1 }));
    // From revision 1: a stale (no-op) or wrong bump is rejected; only +1 succeeds.
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { revision: 1 }));
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { revision: 5 }));
    await assertSucceeds(updateDoc(doc(dbFor(PM), dayPath), { revision: 2 }));
  });

  it('rejects a client update that omits the revision guard', async () => {
    await assertFails(updateDoc(doc(dbFor(PM), dayPath), { notes: 'no revision field written' }));
  });
});

describe('firestore.rules — slug reservations (server-only, WS-G)', () => {
  const slugPath = 'slugs/rtc-ashland-26';
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), slugPath), { eventId: 'event-a' });
    });
  });

  it('no client — not even an admin or PM — can read or write the reservation collection', async () => {
    await assertFails(getDoc(doc(dbFor(ADMIN.uid, ADMIN.token), slugPath)));
    await assertFails(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'slugs/new'), { eventId: 'event-a' }),
    );
    await assertFails(getDoc(doc(dbFor(PM), slugPath)));
    await assertFails(deleteDoc(doc(dbFor(PM), slugPath)));
  });
});

describe('firestore.rules — stages', () => {
  it('any member can read a stage; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-a')));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'events/event-a/stages/stg-a')));
  });

  it('production-manager + admin can create/update/delete stages', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/stages/stg-pm'), { name: 'PM Stage', order: 1 }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'events/event-a/stages/stg-a'), {
        name: 'Renamed',
      }),
    );
    await assertSucceeds(deleteDoc(doc(dbFor(PM), 'events/event-a/stages/stg-a')));
  });

  it('tech and department-lead cannot write stages', async () => {
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/stages/stg-t'), { name: 'no', order: 9 }),
    );
    await assertFails(
      setDoc(doc(dbFor(LEAD), 'events/event-a/stages/stg-l'), { name: 'no', order: 9 }),
    );
  });
});

describe('firestore.rules — production records', () => {
  it('event-level: members read, PM/admin write, tech cannot write', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'events/event-a/production/record')));
    await assertSucceeds(
      setDoc(doc(dbFor(PM), 'events/event-a/production/record'), {
        info: { crew_parking: 'Lot B' },
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(TECH), 'events/event-a/production/record'), {
        info: { crew_parking: 'no' },
      }),
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

describe('firestore.rules — department-scoped section writes (assigned department-lead)', () => {
  const advPath = 'events/event-a/stages/stg-a/advances/adv-1';
  const stageProdPath = 'events/event-a/stages/stg-a/production/record';

  it('assigned dept-lead edits their department: advance content + status + updatedAt', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'content.audio': { foh_console: 'DM7' },
        'sections.audio': { status: 'in_progress', finalizedAt: null, finalizedBy: null },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('assigned dept-lead can finalize and unlock their own section', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'sections.audio': { status: 'complete', finalizedAt: null, finalizedBy: DEPT },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'sections.audio': { status: 'in_progress', finalizedAt: null, finalizedBy: null },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('cannot touch another department', async () => {
    await assertFails(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'content.lighting': { dimmers: '96' },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'sections.lighting': { status: 'in_progress', finalizedAt: null, finalizedBy: null },
      }),
    );
  });

  it('cannot smuggle other fields alongside their department', async () => {
    await assertFails(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'content.audio': { foh_console: 'DM7' },
        artistName: 'Renamed Band',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor(DEPT), advPath), {
        'content.audio': { foh_console: 'DM7' },
        googleCalendarEventId: 'forged',
      }),
    );
  });

  it('stage production: create + update within their department only', async () => {
    // First write materializes the record (setDoc merge → create).
    await assertSucceeds(
      setDoc(doc(dbFor(DEPT), stageProdPath), {
        content: { audio: { foh_console: 'DM7' } },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(DEPT), stageProdPath), {
        'sections.audio': { status: 'in_progress', finalizedAt: null, finalizedBy: null },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor(DEPT), stageProdPath), {
        'content.lighting': { dimmers: '96' },
      }),
    );
  });

  it('stage production create cannot include another department', async () => {
    await assertFails(
      setDoc(doc(dbFor(DEPT), stageProdPath), {
        content: { audio: { ok: 'y' }, lighting: { no: 'n' } },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('event-level production and other event surfaces stay PM-only', async () => {
    await assertFails(
      setDoc(doc(dbFor(DEPT), 'events/event-a/production/record'), {
        info: { crew_parking: 'no' },
      }),
    );
    await assertFails(updateDoc(doc(dbFor(DEPT), 'events/event-a'), { name: 'Renamed' }));
  });

  it('an UNASSIGNED department-lead still cannot write any section', async () => {
    await assertFails(
      updateDoc(doc(dbFor(LEAD), advPath), {
        'content.audio': { foh_console: 'no' },
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('firestore.rules — event checklist (PM-only surface)', () => {
  const chk = (id: string) => `events/event-a/checklist/${id}`;

  it('PM can read, create, complete (user-set timestamp), and delete items', async () => {
    const db = dbFor(PM);
    await assertSucceeds(getDoc(doc(db, chk('chk-1'))));
    await assertSucceeds(
      setDoc(doc(db, chk('chk-new')), {
        text: 'Advance catering',
        section: 'post-show',
        order: 0,
        completedAt: null,
      }),
    );
    // The completion time is deliberately client-set AND editable.
    await assertSucceeds(
      updateDoc(doc(db, chk('chk-1')), { completedAt: Timestamp.fromDate(new Date()) }),
    );
    await assertSucceeds(deleteDoc(doc(db, chk('chk-1'))));
  });

  it('admin can read and write', async () => {
    const db = dbFor(ADMIN.uid, ADMIN.token);
    await assertSucceeds(getDoc(doc(db, chk('chk-1'))));
    await assertSucceeds(updateDoc(doc(db, chk('chk-1')), { text: 'Renamed' }));
  });

  it('department-leads and techs cannot even READ the checklist', async () => {
    await assertFails(getDoc(doc(dbFor(LEAD), chk('chk-1'))));
    await assertFails(getDoc(doc(dbFor(DEPT), chk('chk-1'))));
    await assertFails(getDoc(doc(dbFor(TECH), chk('chk-1'))));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), chk('chk-1'))));
  });

  it('non-PMs cannot write items', async () => {
    await assertFails(
      setDoc(doc(dbFor(TECH), chk('chk-t')), { text: 'x', section: 'main', order: 0 }),
    );
    await assertFails(updateDoc(doc(dbFor(DEPT), chk('chk-1')), { text: 'y' }));
  });

  it('shape: text required, section must be a known key', async () => {
    const db = dbFor(PM);
    await assertFails(setDoc(doc(db, chk('bad-1')), { text: '', section: 'main', order: 0 }));
    await assertFails(setDoc(doc(db, chk('bad-2')), { text: 'ok', section: 'encore', order: 0 }));
  });
});

describe('firestore.rules — checklistTemplates (admin-managed config)', () => {
  it('any approved user reads (PMs import them); pending/anon cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'checklistTemplates/ctpl-1')));
    await assertFails(
      getDoc(doc(dbFor(PENDING, { approved: false }), 'checklistTemplates/ctpl-1')),
    );
    await assertFails(getDoc(doc(dbAnon(), 'checklistTemplates/ctpl-1')));
  });

  it('only admin writes', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'checklistTemplates/ctpl-2'), {
        name: 'Festival',
        items: [],
      }),
    );
    await assertFails(
      setDoc(doc(dbFor(PM), 'checklistTemplates/ctpl-3'), { name: 'Nope', items: [] }),
    );
    await assertFails(deleteDoc(doc(dbFor(PM), 'checklistTemplates/ctpl-1')));
  });
});

describe('firestore.rules — production attachments subcollection', () => {
  const evAtt = (a: string) => `events/event-a/production/record/attachments/${a}`;
  const stAtt = (a: string) => `events/event-a/stages/stg-a/production/record/attachments/${a}`;
  const file = {
    name: 'plot.pdf',
    path: 'events/event-a/production/event/plot.pdf',
    url: 'https://x',
    uploadedBy: PM,
  };

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
      await setDoc(doc(ctx.firestore(), 'contacts/c-linked'), {
        name: 'Tech',
        createdBy: 'admin-1',
        userId: TECH,
      });
    });
  });

  it('any signed-in user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'contacts/c-pm')));
    await assertFails(getDoc(doc(dbAnon(), 'contacts/c-pm')));
  });

  it('a signed-in user can create a contact they author', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(TECH), 'contacts/c-tech'), { name: 'New', createdBy: TECH }),
    );
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
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/c-pm'), { name: 'Admin edit' }),
    );
  });

  it('a user can update the entry linked to their own account, but not delete it or others', async () => {
    // TECH owns the linked entry via userId — may update (e.g. their profile photo)…
    await assertSucceeds(
      updateDoc(doc(dbFor(TECH), 'contacts/c-linked'), { photo: { path: 'p', url: 'u' } }),
    );
    // …but not delete it (delete stays creator/admin)…
    await assertFails(deleteDoc(doc(dbFor(TECH), 'contacts/c-linked')));
    // …and a non-linked, non-creator user cannot update it.
    await assertFails(
      updateDoc(doc(dbFor(OUTSIDER), 'contacts/c-linked'), { photo: { path: 'p', url: 'u' } }),
    );
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
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/c-linked'), { userId: PM }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'contacts/c-pm'), { createdBy: OUTSIDER }),
    );
  });
});

describe('firestore.rules — per-event contact attachments', () => {
  const attachPath = (a: string) => `events/event-a/contacts/${a}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), attachPath('att-seed')), {
        contactId: 'c-pm',
        roleLabel: 'SM',
        addedBy: PM,
      });
    });
  });

  it('members read attachments; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), attachPath('att-seed'))));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), attachPath('att-seed'))));
  });

  it('PM/admin can attach; tech/lead cannot', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(PM), attachPath('att-pm')), { contactId: 'c-pm', addedBy: PM }),
    );
    await assertFails(
      setDoc(doc(dbFor(TECH), attachPath('att-t')), { contactId: 'c-pm', addedBy: TECH }),
    );
    await assertFails(
      setDoc(doc(dbFor(LEAD), attachPath('att-l')), { contactId: 'c-pm', addedBy: LEAD }),
    );
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
    await assertFails(
      setDoc(doc(dbFor(PM), 'documentCategories/tech-rider'), { name: 'Tech Rider', order: 0 }),
    );
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'documentCategories/tech-rider'), {
        name: 'Tech Rider',
        order: 0,
      }),
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
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'artistDocuments/doc-1'), {
        categoryId: 'tech-rider',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'artistDocuments/doc-1'), {
        categoryId: 'media',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor(TECH), 'artistDocuments/doc-1'), { categoryId: 'media' }),
    );
  });

  it('trusted Drive source metadata is immutable to clients — only classification/annotation may change (F-3)', async () => {
    const ref = doc(dbFor(ADMIN.uid, ADMIN.token), 'artistDocuments/doc-1');
    // Curation still works: (re)classify, rename the display label, annotate, mark verified.
    await assertSucceeds(
      updateDoc(ref, {
        categoryId: 'tech-rider',
        displayName: 'Rider (final)',
        verifiedAt: serverTimestamp(),
      }),
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
    await assertFails(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'artistDocuments/up-1'), upload('up-1')),
    );
    await assertFails(
      setDoc(
        doc(dbFor(ORGANIZER.uid, ORGANIZER.token), 'artistDocuments/up-2'),
        upload('up-2', { importedBy: ORGANIZER.uid }),
      ),
    );
    await assertFails(
      setDoc(doc(dbFor(TECH), 'artistDocuments/up-5'), upload('up-5', { importedBy: TECH })),
    );
  });
});

describe('firestore.rules — templates', () => {
  it('any signed-in user can read; anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), 'templates/tpl-1')));
    await assertFails(getDoc(doc(dbAnon(), 'templates/tpl-1')));
  });

  it('only admin can write templates', async () => {
    await assertFails(setDoc(doc(dbFor(PM), 'templates/tpl-1'), { name: 'X' }));
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'templates/tpl-1'), { name: 'X' }),
    );
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
    await assertFails(
      setDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'googleConnections', PM), { connected: false }),
    );
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

  it('calendar subscription prefs: owner reads their own; others cannot; no client writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'calendarSubscriptions', PM), { hidePastEvents: false });
    });
    await assertSucceeds(getDoc(doc(dbFor(PM), 'calendarSubscriptions', PM)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), 'calendarSubscriptions', PM)));
    // Server-managed: the updateCalendarSubscription callable owns every write.
    await assertFails(
      setDoc(doc(dbFor(PM), 'calendarSubscriptions', PM), { hidePastEvents: true }),
    );
    await assertFails(
      updateDoc(doc(dbFor(PM), 'calendarSubscriptions', PM), { hidePastEvents: true }),
    );
  });

  it('calendar feed token + owner docs are server-only (even the owner / admin)', async () => {
    await assertFails(getDoc(doc(dbFor(PM), 'calendarFeeds/some-token-hash')));
    await assertFails(getDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'calendarFeeds/some-token-hash')));
    await assertFails(setDoc(doc(dbFor(PM), 'calendarFeeds/some-token-hash'), { uid: PM }));
    await assertFails(getDoc(doc(dbFor(PM), 'calendarFeedOwners', PM)));
    await assertFails(getDoc(doc(dbFor(ADMIN.uid, ADMIN.token), 'calendarFeedOwners', PM)));
    await assertFails(setDoc(doc(dbFor(PM), 'calendarFeedOwners', PM), { activeTokenHash: 'x' }));
  });
});

describe('firestore.rules — booked-call inbox (Phase 11b sync)', () => {
  const bookingPath = 'events/event-a/callBookings/cal-evt-1';

  it('any event member reads the inbox; a non-member cannot', async () => {
    await assertSucceeds(getDoc(doc(dbFor(TECH), bookingPath)));
    await assertFails(getDoc(doc(dbFor(OUTSIDER), bookingPath)));
  });

  it('PM/admin can dismiss only; other mutations and roles are denied', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), bookingPath), {
        status: 'dismissed',
        updatedAt: serverTimestamp(),
      }),
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), bookingPath), { status: 'needs_review' });
    });
    await assertSucceeds(
      updateDoc(doc(dbFor(ADMIN.uid, ADMIN.token), bookingPath), {
        status: 'dismissed',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(dbFor(TECH), bookingPath), { status: 'dismissed' }));
    await assertFails(updateDoc(doc(dbFor(LEAD), bookingPath), { status: 'dismissed' }));
    await assertFails(updateDoc(doc(dbFor(PM), bookingPath), { status: 'attached' }));
    await assertFails(updateDoc(doc(dbFor(PM), bookingPath), { summary: 'forged' }));
    await assertFails(
      updateDoc(doc(dbFor(PM), bookingPath), {
        status: 'dismissed',
        summary: 'forged',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(dbFor(PM), bookingPath)));
    await assertFails(
      setDoc(doc(dbFor(PM), 'events/event-a/callBookings/forged'), {
        status: 'needs_review',
      }),
    );
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
    await assertFails(
      setDoc(doc(dbFor(TECH), at(5)), { ...validDoc(), fileId: 'efile-5', uploadedBy: TECH }),
    );
  });

  it('updates re-day/categorize/rename but keep audit + Drive source metadata immutable; PM deletes', async () => {
    await assertSucceeds(
      updateDoc(doc(dbFor(PM), docPath), {
        day: null,
        categoryId: 'cat-1',
        displayName: 'Site plan',
      }),
    );
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
    await assertFails(
      setDoc(doc(dbFor(TECH), at(4)), { ...validDoc(), fileId: 'file-4', addedBy: TECH }),
    );
  });

  it('rejects a blank fileId or name, and a forged (non-server) addedAt, on create', async () => {
    const at = (n: number) => `events/event-a/stages/stg-a/advances/adv-1/documents/file-${n}`;
    await assertFails(setDoc(doc(dbFor(PM), at(5)), { ...validDoc(), fileId: '' }));
    await assertFails(setDoc(doc(dbFor(PM), at(6)), { ...validDoc(), fileId: 'file-6', name: '' }));
    await assertFails(
      setDoc(doc(dbFor(PM), at(7)), {
        ...validDoc(),
        fileId: 'file-7',
        addedAt: Timestamp.fromMillis(0),
      }),
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

// ---------------------------------------------------------------------------
// Production director — cross-event read oversight
// (planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md). The claim is global, read-only and
// event-scoped: it widens every event-subtree READ (plus the PM checklist) and
// must never grant a write, nor widen the unscoped collection-group membership
// surface. DIRECTOR holds no membership anywhere.
// ---------------------------------------------------------------------------
describe('firestore.rules — production director (cross-event read oversight)', () => {
  const advPath = 'events/event-a/stages/stg-a/advances/adv-1';
  const stageProd = 'events/event-a/stages/stg-a/production/record';
  const eventProd = 'events/event-a/production/record';
  const dayPath = 'events/event-a/scheduleDays/2026-07-14';
  const chkPath = 'events/event-a/checklist/chk-1';

  const dbDirector = () => dbFor(DIRECTOR.uid, DIRECTOR.token);
  const attachment = { name: 'plot.pdf', path: 'events/event-a/x.pdf', url: 'https://x' };

  // Every path in the plan's "Exhaustive event-read inventory", on event-a — an event the
  // director-only identity is NOT a member of.
  const EVENT_READ_INVENTORY: Array<[string, string]> = [
    ['event document', 'events/event-a'],
    ['member roster row', `events/event-a/members/${PM}`],
    ['stage', 'events/event-a/stages/stg-a'],
    ['advance', advPath],
    ['advance Drive-file metadata', `${advPath}/driveFiles/df-1`],
    ['advance included document', `${advPath}/documents/file-1`],
    ['quote', `${advPath}/quotes/q-seed`],
    ['stage production record', stageProd],
    ['stage production attachment', `${stageProd}/attachments/a1`],
    ['event production record', eventProd],
    ['event production attachment', `${eventProd}/attachments/a1`],
    ['event contact attachment', 'events/event-a/contacts/att-seed'],
    ['event document', 'events/event-a/documents/efile-1'],
    ['schedule day', dayPath],
    ['call booking', 'events/event-a/callBookings/cal-evt-1'],
    ['flag', 'events/event-a/flags/seed'],
  ];

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Combined identities hold the director claim PLUS a per-event role on event A only.
      await setDoc(doc(db, 'events/event-a/members', DIRECTOR_PM.uid), {
        role: 'production-manager',
        addedBy: 'admin-1',
        uid: DIRECTOR_PM.uid,
      });
      await setDoc(doc(db, 'events/event-a/members', DIRECTOR_TECH.uid), {
        role: 'tech',
        addedBy: 'admin-1',
        uid: DIRECTOR_TECH.uid,
      });
      // The rest of the read inventory the shared beforeEach doesn't already seed.
      await setDoc(doc(db, `${advPath}/driveFiles/df-1`), { fileId: 'df-1', name: 'Plot.pdf' });
      await setDoc(doc(db, `${advPath}/documents/file-1`), {
        fileId: 'file-1',
        name: 'Rider.pdf',
        includePacket: false,
        addedBy: PM,
      });
      await setDoc(doc(db, `${advPath}/quotes/q-seed`), {
        title: 'Backline',
        status: 'sent',
        createdBy: PM,
      });
      await setDoc(doc(db, stageProd), { content: { audio: { foh_console: 'DM7' } } });
      await setDoc(doc(db, `${stageProd}/attachments/a1`), attachment);
      await setDoc(doc(db, eventProd), { info: { crew_parking: 'Lot B' } });
      await setDoc(doc(db, `${eventProd}/attachments/a1`), attachment);
      await setDoc(doc(db, 'events/event-a/contacts/att-seed'), {
        contactId: 'c-pm',
        addedBy: PM,
      });
      await setDoc(doc(db, 'events/event-a/documents/efile-1'), {
        fileId: 'efile-1',
        name: 'SitePlan.pdf',
        uploadedBy: PM,
      });
      await setDoc(doc(db, dayPath), {
        date: '2026-07-14',
        dayType: 'loadIn',
        items: [],
        createdBy: PM,
        revision: 0,
      });
    });
  });

  it.each(EVENT_READ_INVENTORY)(
    'reads the %s of an event they are not a member of',
    async (_label, path) => {
      await assertSucceeds(getDoc(doc(dbDirector(), path)));
    },
  );

  it('reads an event they are not a member of at every list surface too', async () => {
    const db = dbDirector();
    await assertSucceeds(getDocs(collection(db, 'events/event-a/stages')));
    await assertSucceeds(getDocs(collection(db, `${advPath}/quotes`)));
    await assertSucceeds(getDocs(collection(db, 'events/event-a/scheduleDays')));
    await assertSucceeds(getDocs(collection(db, 'events/event-a/flags')));
  });

  it('gets no writes on the event / stage / advance spine', async () => {
    const db = dbDirector();
    await assertFails(updateDoc(doc(db, 'events/event-a'), { name: 'Director edit' }));
    await assertFails(deleteDoc(doc(db, 'events/event-a')));
    // Membership management stays admin-only — a director cannot self-enrol as PM.
    await assertFails(
      setDoc(doc(db, 'events/event-a/members', DIRECTOR.uid), {
        role: 'production-manager',
        addedBy: DIRECTOR.uid,
        uid: DIRECTOR.uid,
      }),
    );
    await assertFails(deleteDoc(doc(db, 'events/event-a/members', TECH)));
    await assertFails(setDoc(doc(db, 'events/event-a/stages/stg-dir'), { name: 'Nope', order: 9 }));
    await assertFails(updateDoc(doc(db, 'events/event-a/stages/stg-a'), { name: 'Renamed' }));
    await assertFails(deleteDoc(doc(db, 'events/event-a/stages/stg-a')));
    await assertFails(
      setDoc(doc(db, 'events/event-a/stages/stg-a/advances/adv-dir'), {
        artistName: 'Nope',
        createdBy: DIRECTOR.uid,
        sections: {},
      }),
    );
    await assertFails(updateDoc(doc(db, advPath), { artistName: 'Renamed' }));
    // Finalize/unlock rides the advance update gate, so it is denied as well.
    await assertFails(
      updateDoc(doc(db, advPath), {
        'sections.audio': { status: 'complete', finalizedAt: null, finalizedBy: DIRECTOR.uid },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(db, advPath)));
  });

  it('gets no writes on quotes, documents, production records, or attachments', async () => {
    const db = dbDirector();
    await assertFails(
      setDoc(doc(db, `${advPath}/quotes/q-dir`), {
        title: 'X',
        status: 'draft',
        createdBy: DIRECTOR.uid,
      }),
    );
    await assertFails(updateDoc(doc(db, `${advPath}/quotes/q-seed`), { status: 'approved' }));
    await assertFails(deleteDoc(doc(db, `${advPath}/quotes/q-seed`)));
    await assertFails(updateDoc(doc(db, `${advPath}/documents/file-1`), { includePacket: true }));
    await assertFails(deleteDoc(doc(db, `${advPath}/documents/file-1`)));
    await assertFails(deleteDoc(doc(db, `${advPath}/driveFiles/df-1`)));
    await assertFails(setDoc(doc(db, eventProd), { info: { crew_parking: 'no' } }));
    await assertFails(setDoc(doc(db, `${eventProd}/attachments/a-dir`), attachment));
    await assertFails(setDoc(doc(db, stageProd), { content: { audio: { foh_console: 'no' } } }));
    await assertFails(setDoc(doc(db, `${stageProd}/attachments/a-dir`), attachment));
  });

  it('gets no writes on contacts, event documents, schedules, bookings, or flags', async () => {
    const db = dbDirector();
    await assertFails(
      setDoc(doc(db, 'events/event-a/contacts/att-dir'), {
        contactId: 'c-pm',
        addedBy: DIRECTOR.uid,
      }),
    );
    await assertFails(deleteDoc(doc(db, 'events/event-a/contacts/att-seed')));
    await assertFails(updateDoc(doc(db, 'events/event-a/documents/efile-1'), { day: null }));
    await assertFails(deleteDoc(doc(db, 'events/event-a/documents/efile-1')));
    await assertFails(
      setDoc(doc(db, 'events/event-a/scheduleDays/2026-07-20'), {
        date: '2026-07-20',
        dayType: 'show',
        items: [],
        createdBy: DIRECTOR.uid,
        revision: 0,
      }),
    );
    await assertFails(updateDoc(doc(db, dayPath), { notes: 'no', revision: 1 }));
    await assertFails(deleteDoc(doc(db, dayPath)));
    await assertFails(
      updateDoc(doc(db, 'events/event-a/callBookings/cal-evt-1'), {
        status: 'dismissed',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, 'events/event-a/flags/f-dir'), { createdBy: DIRECTOR.uid, text: 'no' }),
    );
    await assertFails(updateDoc(doc(db, 'events/event-a/flags/seed'), { text: 'edited' }));
    await assertFails(deleteDoc(doc(db, 'events/event-a/flags/seed')));
  });

  it('reads the PM checklist but cannot mutate it', async () => {
    const db = dbDirector();
    await assertSucceeds(getDoc(doc(db, chkPath)));
    await assertSucceeds(getDocs(collection(db, 'events/event-a/checklist')));
    await assertFails(
      setDoc(doc(db, 'events/event-a/checklist/chk-dir'), {
        text: 'Director item',
        section: 'main',
        order: 0,
        completedAt: null,
      }),
    );
    await assertFails(updateDoc(doc(db, chkPath), { text: 'Renamed' }));
    await assertFails(updateDoc(doc(db, chkPath), { completedAt: Timestamp.fromDate(new Date()) }));
    await assertFails(deleteDoc(doc(db, chkPath)));
  });

  it('an absent, false, unapproved, or non-boolean director claim grants nothing', async () => {
    const identities = [
      ['absent claim', dbFor('user-dir-absent', { approved: true })],
      ['false claim', dbFor('user-dir-false', { approved: true, productionDirector: false })],
      // Approval is the outer gate: the claim alone never resurrects a pending/revoked account.
      ['unapproved', dbFor('user-dir-pending', { approved: false, productionDirector: true })],
      // `== true` is a strict comparison — a stringy claim is not a grant.
      ['string claim', dbFor('user-dir-string', { approved: true, productionDirector: 'true' })],
    ] as const;
    for (const [, db] of identities) {
      await assertFails(getDoc(doc(db, 'events/event-a')));
      await assertFails(getDoc(doc(db, advPath)));
      await assertFails(getDoc(doc(db, chkPath)));
      await assertFails(getDoc(doc(db, `${eventProd}/attachments/a1`)));
    }
  });

  it('director + PM writes only on the assigned event (capabilities are additive)', async () => {
    const db = dbFor(DIRECTOR_PM.uid, DIRECTOR_PM.token);
    // Event A — they hold the PM row, so the PM capability applies.
    await assertSucceeds(getDoc(doc(db, 'events/event-a')));
    await assertSucceeds(updateDoc(doc(db, 'events/event-a'), { name: 'Event A — dir/PM edit' }));
    await assertSucceeds(
      setDoc(doc(db, 'events/event-a/stages/stg-dirpm'), { name: 'Dir Stage', order: 5 }),
    );
    await assertSucceeds(updateDoc(doc(db, chkPath), { text: 'PM edit' }));
    // Event B — the director claim still reads it; the PM role does NOT follow them there.
    await assertSucceeds(getDoc(doc(db, 'events/event-b')));
    await assertFails(updateDoc(doc(db, 'events/event-b'), { name: 'nope' }));
    await assertFails(
      setDoc(doc(db, 'events/event-b/stages/stg-nope'), { name: 'nope', order: 0 }),
    );
    await assertFails(deleteDoc(doc(db, 'events/event-b')));
  });

  it('director + tech keeps the global read and gains no writes', async () => {
    const db = dbFor(DIRECTOR_TECH.uid, DIRECTOR_TECH.token);
    // A lower per-event role must never downgrade the global read capability.
    await assertSucceeds(getDoc(doc(db, 'events/event-a'))); // member (tech)
    await assertSucceeds(getDoc(doc(db, 'events/event-b'))); // NOT a member — director claim
    // A tech alone cannot read the checklist; the director claim carries it.
    await assertSucceeds(getDoc(doc(db, chkPath)));
    await assertFails(updateDoc(doc(db, 'events/event-a'), { name: 'nope' }));
    await assertFails(setDoc(doc(db, 'events/event-a/stages/stg-dt'), { name: 'no', order: 0 }));
    await assertFails(updateDoc(doc(db, chkPath), { text: 'no' }));
    // Flagging is a PM/dept-lead capability — the director claim does not add it.
    await assertFails(
      setDoc(doc(db, 'events/event-a/flags/f-dt'), { createdBy: DIRECTOR_TECH.uid, text: 'no' }),
    );
  });

  it('cannot collection-group query other users’ membership rows, but reads a known roster', async () => {
    const db = dbDirector();
    // The unscoped membership surface stays self-only — no "every membership row" dump.
    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', PM))));
    await assertFails(getDocs(query(collectionGroup(db, 'members'))));
    // Their own (empty) events-list query still works.
    const own = await assertSucceeds(
      getDocs(query(collectionGroup(db, 'members'), where('uid', '==', DIRECTOR.uid))),
    );
    expect(own.size).toBe(0);
    // A KNOWN event's roster, one event at a time, through the nested rule.
    await assertSucceeds(getDoc(doc(db, 'events/event-a/members', PM)));
    await assertSucceeds(getDocs(collection(db, 'events/event-a/members')));
  });

  it('the oversight claim stays event-scoped — no admin surfaces', async () => {
    const db = dbDirector();
    // Admin-managed config: readable to any approved user, still not writable.
    await assertFails(setDoc(doc(db, 'departments/audio'), { name: 'Audio', order: 0 }));
    await assertFails(setDoc(doc(db, 'checklistTemplates/ctpl-dir'), { name: 'X', items: [] }));
    await assertFails(setDoc(doc(db, 'config/branding'), { defaultLogos: [] }));
    // No event creation (that stays the separate organizer capability, server-side).
    await assertFails(
      setDoc(doc(db, 'events/evt-dir'), {
        name: 'Director Fest',
        status: 'draft',
        createdBy: DIRECTOR.uid,
      }),
    );
    // Other users' profiles and server-only collections stay closed.
    await assertFails(getDoc(doc(db, 'users', PM)));
    await assertFails(getDoc(doc(db, 'googleTokens', PM)));
    await assertFails(getDoc(doc(db, 'slugs/rtc-ashland-26')));
  });
});

describe('contacts — create userId link', () => {
  const newContact = (extra: Record<string, unknown> = {}) => ({
    name: 'Someone',
    createdBy: TECH,
    ...extra,
  });

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
