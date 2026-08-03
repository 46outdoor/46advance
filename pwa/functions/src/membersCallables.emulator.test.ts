/**
 * Emulator-backed tests for assignEventMember / removeEventMember: the PM-or-admin gate,
 * email→uid resolution, the approved-target gate, the self-change guards, `ifAbsent`
 * (crew tech auto-enroll), and department validation against the event's enabled list.
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { assignEventMember, removeEventMember } from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const ADMIN = authContext('admin-uid', { admin: true, approved: true });
const PM = authContext('pm-uid', { approved: true });
const TECH = authContext('tech-uid', { approved: true });
const TARGET_UID = 'target-uid';
const TARGET_EMAIL = 'target@example.com';

const seedEvent = async () => {
  await db.doc('events/evt-1').set({
    name: 'Alpha Festival',
    status: 'active',
    createdBy: PM.uid,
    departmentIds: ['audio', 'lighting'],
  });
  await db.doc(`events/evt-1/members/${PM.uid}`).set({
    role: 'production-manager',
    addedBy: PM.uid,
    uid: PM.uid,
  });
  await db.doc(`events/evt-1/members/${TECH.uid}`).set({
    role: 'tech',
    addedBy: PM.uid,
    uid: TECH.uid,
  });
};

const seedTarget = async (approved = true) => {
  await getAuth().createUser({
    uid: TARGET_UID,
    email: TARGET_EMAIL,
    displayName: 'Tara Target',
  });
  await db.doc(`users/${TARGET_UID}`).set({ approved, displayName: 'Tara Target' });
};

beforeEach(async () => {
  await clearEmulators();
  // assertActiveUser reads users/{uid} for non-admin callers (mirrors syncUserClaims).
  await db.doc(`users/${PM.uid}`).set({ approved: true });
  await db.doc(`users/${TECH.uid}`).set({ approved: true });
  await seedEvent();
  await seedTarget();
});

describe('assignEventMember', () => {
  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest({ eventId: 'evt-1', email: TARGET_EMAIL, role: 'tech' }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('a tech (non-PM member) cannot assign members', async () => {
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest({ eventId: 'evt-1', email: TARGET_EMAIL, role: 'tech' }, TECH),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('the event PM assigns a co-production-manager by email (denormalized display fields)', async () => {
    const res = await testEnv.wrap(assignEventMember)(
      callableRequest({ eventId: 'evt-1', email: TARGET_EMAIL, role: 'production-manager' }, PM),
    );
    expect(res).toEqual({ uid: TARGET_UID, role: 'production-manager', updated: true });

    const member = await db.doc(`events/evt-1/members/${TARGET_UID}`).get();
    expect(member.get('role')).toBe('production-manager');
    expect(member.get('uid')).toBe(TARGET_UID);
    expect(member.get('addedBy')).toBe(PM.uid);
    expect(member.get('email')).toBe(TARGET_EMAIL);
    expect(member.get('displayName')).toBe('Tara Target');
  });

  it('an admin who is not a member can also assign', async () => {
    const res = await testEnv.wrap(assignEventMember)(
      callableRequest({ eventId: 'evt-1', uid: TARGET_UID, role: 'tech' }, ADMIN),
    );
    expect(res.updated).toBe(true);
  });

  it('department-lead: stores the departments, validated against the event', async () => {
    await testEnv.wrap(assignEventMember)(
      callableRequest(
        { eventId: 'evt-1', uid: TARGET_UID, role: 'department-lead', departments: ['audio'] },
        PM,
      ),
    );
    const member = await db.doc(`events/evt-1/members/${TARGET_UID}`).get();
    expect(member.get('departments')).toEqual(['audio']);

    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest(
          { eventId: 'evt-1', uid: TARGET_UID, role: 'department-lead', departments: ['catering'] },
          PM,
        ),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('departments are dropped for non-department-lead roles', async () => {
    await testEnv.wrap(assignEventMember)(
      callableRequest(
        { eventId: 'evt-1', uid: TARGET_UID, role: 'tech', departments: ['audio'] },
        PM,
      ),
    );
    const member = await db.doc(`events/evt-1/members/${TARGET_UID}`).get();
    expect(member.get('departments')).toBeUndefined();
  });

  it('unknown email → not-found with a human message', async () => {
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest({ eventId: 'evt-1', email: 'nobody@example.com', role: 'tech' }, PM),
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('an unapproved target account is rejected', async () => {
    await db.doc(`users/${TARGET_UID}`).set({ approved: false });
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest({ eventId: 'evt-1', email: TARGET_EMAIL, role: 'tech' }, PM),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('a non-admin PM cannot change their own membership', async () => {
    await getAuth().createUser({ uid: PM.uid, email: 'pm@example.com' });
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest({ eventId: 'evt-1', uid: PM.uid, role: 'tech' }, PM),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('ifAbsent: enrolls a non-member as tech, but never touches an existing membership', async () => {
    const first = await testEnv.wrap(assignEventMember)(
      callableRequest({ eventId: 'evt-1', uid: TARGET_UID, role: 'tech', ifAbsent: true }, PM),
    );
    expect(first).toEqual({ uid: TARGET_UID, role: 'tech', updated: true });

    // Promote them, then re-run the auto-enroll — the PM role must survive.
    await testEnv.wrap(assignEventMember)(
      callableRequest({ eventId: 'evt-1', uid: TARGET_UID, role: 'production-manager' }, PM),
    );
    const again = await testEnv.wrap(assignEventMember)(
      callableRequest({ eventId: 'evt-1', uid: TARGET_UID, role: 'tech', ifAbsent: true }, PM),
    );
    expect(again).toEqual({ uid: TARGET_UID, role: 'production-manager', updated: false });
    const member = await db.doc(`events/evt-1/members/${TARGET_UID}`).get();
    expect(member.get('role')).toBe('production-manager');
  });

  it('requires exactly one of email/uid', async () => {
    await expect(
      testEnv.wrap(assignEventMember)(callableRequest({ eventId: 'evt-1', role: 'tech' }, PM)),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('removeEventMember', () => {
  it('the event PM removes a member; removing again reports removed: false', async () => {
    const res = await testEnv.wrap(removeEventMember)(
      callableRequest({ eventId: 'evt-1', uid: TECH.uid }, PM),
    );
    expect(res).toEqual({ removed: true });
    expect((await db.doc(`events/evt-1/members/${TECH.uid}`).get()).exists).toBe(false);

    const again = await testEnv.wrap(removeEventMember)(
      callableRequest({ eventId: 'evt-1', uid: TECH.uid }, PM),
    );
    expect(again).toEqual({ removed: false });
  });

  it('a non-admin PM cannot remove themselves (the event keeps a PM)', async () => {
    await expect(
      testEnv.wrap(removeEventMember)(callableRequest({ eventId: 'evt-1', uid: PM.uid }, PM)),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('an admin may remove anyone, including a PM', async () => {
    const res = await testEnv.wrap(removeEventMember)(
      callableRequest({ eventId: 'evt-1', uid: PM.uid }, ADMIN),
    );
    expect(res).toEqual({ removed: true });
  });

  it('a tech cannot remove members', async () => {
    await expect(
      testEnv.wrap(removeEventMember)(callableRequest({ eventId: 'evt-1', uid: PM.uid }, TECH)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
