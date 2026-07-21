import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  deleteUser,
  setUserApproved,
  setUserDisplayName,
  setUserOrganizer,
  syncUserClaims,
} from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

// Handler tests for the admin/approval callables (index.ts). Each asserts the security gate,
// the Auth custom-claim merge, and the resulting Firestore state against the live emulator.
// ADMIN_EMAILS is pinned to `owner@allow.test` in vitest.emulator.config.ts.
const ADMIN_EMAIL = 'owner@allow.test';

const auth = () => getAuth();
const users = () => getFirestore().collection('users');
const contacts = () => getFirestore().collection('contacts');
const claimsOf = async (uid: string) => (await auth().getUser(uid)).customClaims ?? {};

afterAll(() => {
  testEnv.cleanup();
});

beforeEach(async () => {
  await clearEmulators();
});

describe('setUserApproved', () => {
  it('an admin approves a user, preserving existing claims', async () => {
    await auth().createUser({ uid: 'target', email: 'target@example.com' });
    await auth().setCustomUserClaims('target', { organizer: true });

    const res = await testEnv.wrap(setUserApproved)(
      callableRequest({ uid: 'target', approved: true }, authContext('admin1', { admin: true })),
    );

    expect(res).toEqual({ uid: 'target', approved: true });
    const claims = await claimsOf('target');
    expect(claims.approved).toBe(true);
    expect(claims.organizer).toBe(true); // merge preserved the prior claim
    expect((await users().doc('target').get()).data()?.approved).toBe(true);
  });

  it('rejects a non-admin caller before any write', async () => {
    await auth().createUser({ uid: 'target' });
    await expect(
      testEnv.wrap(setUserApproved)(
        callableRequest({ uid: 'target', approved: true }, authContext('user1', {})),
      ),
    ).rejects.toThrow(/admin only/i);
    expect(await claimsOf('target')).toEqual({}); // untouched
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(
      testEnv.wrap(setUserApproved)(callableRequest({ uid: 'target', approved: true })),
    ).rejects.toThrow(/sign in/i);
  });

  it('revoking a user disconnects Google, clears the mirror, and preserves unrelated claims', async () => {
    const db = getFirestore();
    await auth().createUser({ uid: 'target', email: 'target@example.com' });
    await auth().setCustomUserClaims('target', { approved: true, organizer: true });
    await users().doc('target').set({ approved: true });
    // No revokable token value → disconnectGoogle skips the Google network call.
    await db.collection('googleTokens').doc('target').set({ accessTokenExpiry: 1 });
    await db.collection('googleConnections').doc('target').set({ connected: true });

    const res = await testEnv.wrap(setUserApproved)(
      callableRequest({ uid: 'target', approved: false }, authContext('admin1', { admin: true })),
    );

    expect(res).toEqual({ uid: 'target', approved: false });
    const claims = await claimsOf('target');
    expect(claims.approved).toBe(false);
    expect(claims.organizer).toBe(true); // unrelated claim preserved through the revoke
    expect((await users().doc('target').get()).data()?.approved).toBe(false);
    expect((await db.collection('googleTokens').doc('target').get()).exists).toBe(false);
    expect((await db.collection('googleConnections').doc('target').get()).exists).toBe(false);
  });

  it('approving a user does not disconnect their Google integration', async () => {
    const db = getFirestore();
    await auth().createUser({ uid: 'target' });
    await db.collection('googleTokens').doc('target').set({ accessTokenExpiry: 1 });
    await db.collection('googleConnections').doc('target').set({ connected: true });

    await testEnv.wrap(setUserApproved)(
      callableRequest({ uid: 'target', approved: true }, authContext('admin1', { admin: true })),
    );

    expect((await db.collection('googleTokens').doc('target').get()).exists).toBe(true);
    expect((await db.collection('googleConnections').doc('target').get()).exists).toBe(true);
  });
});

describe('setUserOrganizer', () => {
  it('an admin sets organizer, preserving the approved claim', async () => {
    await auth().createUser({ uid: 'target' });
    await auth().setCustomUserClaims('target', { approved: true });

    const res = await testEnv.wrap(setUserOrganizer)(
      callableRequest({ uid: 'target', organizer: true }, authContext('admin1', { admin: true })),
    );

    expect(res).toEqual({ uid: 'target', organizer: true });
    const claims = await claimsOf('target');
    expect(claims.organizer).toBe(true);
    expect(claims.approved).toBe(true); // merge preserved
    expect((await users().doc('target').get()).data()?.organizer).toBe(true);
  });

  it('rejects a non-admin caller', async () => {
    await auth().createUser({ uid: 'target' });
    await expect(
      testEnv.wrap(setUserOrganizer)(
        callableRequest({ uid: 'target', organizer: true }, authContext('user1', {})),
      ),
    ).rejects.toThrow(/admin only/i);
  });
});

describe('setUserDisplayName', () => {
  it('an admin sets the name and syncs the linked contact', async () => {
    await auth().createUser({ uid: 'target' });
    await contacts().doc('c1').set({ name: 'Old Name', userId: 'target' });

    const res = await testEnv.wrap(setUserDisplayName)(
      callableRequest(
        { uid: 'target', displayName: '  New Name  ' },
        authContext('admin1', { admin: true }),
      ),
    );

    expect(res).toEqual({ uid: 'target', displayName: 'New Name' }); // trimmed
    expect((await users().doc('target').get()).data()?.displayName).toBe('New Name');
    expect((await contacts().doc('c1').get()).data()?.name).toBe('New Name'); // contact synced
  });

  it('a blank name clears to null', async () => {
    await auth().createUser({ uid: 'target' });
    const res = await testEnv.wrap(setUserDisplayName)(
      callableRequest({ uid: 'target', displayName: '   ' }, authContext('admin1', { admin: true })),
    );
    expect(res).toEqual({ uid: 'target', displayName: null });
    expect((await users().doc('target').get()).data()?.displayName).toBeNull();
  });

  it('rejects a non-admin caller', async () => {
    await expect(
      testEnv.wrap(setUserDisplayName)(
        callableRequest({ uid: 'target', displayName: 'X' }, authContext('user1', {})),
      ),
    ).rejects.toThrow(/admin only/i);
  });
});

describe('deleteUser', () => {
  it('an admin deletes the account, memberships, and unlinks the contact', async () => {
    await auth().createUser({ uid: 'target' });
    await users().doc('target').set({ email: 'target@example.com', approved: true });
    await getFirestore().collection('events').doc('e1').collection('members').doc('target').set({ uid: 'target' });
    await contacts().doc('c1').set({ name: 'Target', userId: 'target' });

    const res = await testEnv.wrap(deleteUser)(
      callableRequest({ uid: 'target' }, authContext('admin1', { admin: true })),
    );

    expect(res).toEqual({ uid: 'target', deleted: true });
    await expect(auth().getUser('target')).rejects.toThrow(); // Auth account gone
    expect((await users().doc('target').get()).exists).toBe(false);
    const member = await getFirestore().collection('events').doc('e1').collection('members').doc('target').get();
    expect(member.exists).toBe(false); // membership cleared
    expect((await contacts().doc('c1').get()).data()?.userId).toBeNull(); // contact unlinked, not deleted
  });

  it('refuses to delete your own account', async () => {
    await auth().createUser({ uid: 'admin1' });
    await expect(
      testEnv.wrap(deleteUser)(
        callableRequest({ uid: 'admin1' }, authContext('admin1', { admin: true })),
      ),
    ).rejects.toThrow(/your own account/i);
    expect((await auth().getUser('admin1')).uid).toBe('admin1'); // still there
  });

  it('rejects a non-admin caller', async () => {
    await expect(
      testEnv.wrap(deleteUser)(callableRequest({ uid: 'target' }, authContext('user1', {}))),
    ).rejects.toThrow(/admin only/i);
  });

  it('drops the Google integration and is idempotent on re-run (already-gone tolerated)', async () => {
    const db = getFirestore();
    await auth().createUser({ uid: 'target' });
    await users().doc('target').set({ approved: true });
    await db.collection('googleTokens').doc('target').set({ accessTokenExpiry: 1 });
    await db.collection('googleConnections').doc('target').set({ connected: true });

    const first = await testEnv.wrap(deleteUser)(
      callableRequest({ uid: 'target' }, authContext('admin1', { admin: true })),
    );
    expect(first).toEqual({ uid: 'target', deleted: true });
    await expect(auth().getUser('target')).rejects.toThrow(); // Auth account gone
    expect((await db.collection('googleTokens').doc('target').get()).exists).toBe(false);
    expect((await db.collection('googleConnections').doc('target').get()).exists).toBe(false);

    // Re-running after the account is already gone succeeds (idempotent), never throwing.
    const second = await testEnv.wrap(deleteUser)(
      callableRequest({ uid: 'target' }, authContext('admin1', { admin: true })),
    );
    expect(second).toEqual({ uid: 'target', deleted: true });
  });
});

describe('syncUserClaims (self-service claim reconciliation)', () => {
  it('rejects an unauthenticated caller', async () => {
    await expect(testEnv.wrap(syncUserClaims)(callableRequest({}))).rejects.toThrow(/sign in/i);
  });

  it('grants admin to a verified allowlisted email', async () => {
    await auth().createUser({ uid: 'me', email: ADMIN_EMAIL });
    const res = await testEnv.wrap(syncUserClaims)(
      callableRequest({}, authContext('me', { email: ADMIN_EMAIL, email_verified: true })),
    );

    expect(res).toMatchObject({ isAdmin: true, approved: true });
    const claims = await claimsOf('me');
    expect(claims.admin).toBe(true);
    expect(claims.approved).toBe(true);
  });

  it('does NOT grant admin to the allowlisted email until it is verified', async () => {
    await auth().createUser({ uid: 'me', email: ADMIN_EMAIL });
    const res = await testEnv.wrap(syncUserClaims)(
      callableRequest({}, authContext('me', { email: ADMIN_EMAIL, email_verified: false })),
    );

    expect(res.isAdmin).toBe(false); // the P0 escalation gate
    expect((await claimsOf('me')).admin ?? false).toBe(false);
  });

  it('never downgrades an already-admin account for lack of verification', async () => {
    await auth().createUser({ uid: 'me', email: ADMIN_EMAIL });
    await auth().setCustomUserClaims('me', { admin: true, approved: true });

    const res = await testEnv.wrap(syncUserClaims)(
      callableRequest({}, authContext('me', { email: ADMIN_EMAIL, email_verified: false })),
    );

    expect(res.isAdmin).toBe(true); // prior admin retained
    expect((await claimsOf('me')).admin).toBe(true);
  });

  it('leaves a brand-new non-allowlisted account pending (approved=false)', async () => {
    await auth().createUser({ uid: 'me', email: 'stranger@example.com' });
    const res = await testEnv.wrap(syncUserClaims)(
      callableRequest({}, authContext('me', { email: 'stranger@example.com', email_verified: true })),
    );

    expect(res).toMatchObject({ isAdmin: false, approved: false });
    expect((await users().doc('me').get()).data()?.approved).toBe(false);
  });
});
