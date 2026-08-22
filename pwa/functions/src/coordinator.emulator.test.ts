import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setUserProductionCoordinator, syncUserClaims } from './index';
import { assignEventMember } from './members';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();

// Production coordinator (CREW_TRAVEL_LODGING_PLAN Phase 2) — the claim lifecycle and the
// ONE membership write the claim may perform: Tech auto-enroll (role=tech + ifAbsent), the
// no-op-if-any-membership-exists path that can never assign authority. Everything else on
// assignEventMember stays PM/admin.

const db = () => getFirestore();
const claimsOf = async (uid: string) => (await getAuth().getUser(uid)).customClaims ?? {};

const EVENT = 'event-c';

afterAll(() => {
  testEnv.cleanup();
});

beforeEach(async () => {
  await clearEmulators();
  await db().doc(`events/${EVENT}`).set({ name: 'Event C', status: 'active' });
});

describe('setUserProductionCoordinator', () => {
  it('admin grants: claim set, mirror stamped, other claims preserved', async () => {
    await getAuth().createUser({ uid: 'target-c', email: 'c@x.test' });
    await getAuth().setCustomUserClaims('target-c', { approved: true, organizer: true });

    const res = await testEnv.wrap(setUserProductionCoordinator)(
      callableRequest(
        { uid: 'target-c', productionCoordinator: true },
        authContext('admin1', { admin: true }),
      ),
    );
    expect(res).toMatchObject({ uid: 'target-c', productionCoordinator: true });
    const claims = await claimsOf('target-c');
    expect(claims.productionCoordinator).toBe(true);
    expect(claims.organizer).toBe(true); // merge, not clobber
    const mirror = await db().doc('users/target-c').get();
    expect(mirror.get('productionCoordinator')).toBe(true);
    expect(mirror.get('productionCoordinatorUpdatedBy')).toBe('admin1');
  });

  it('revoke clears the claim and revokes refresh tokens (containment)', async () => {
    await getAuth().createUser({ uid: 'target-r', email: 'r@x.test' });
    await getAuth().setCustomUserClaims('target-r', {
      approved: true,
      productionCoordinator: true,
    });
    const before = (await getAuth().getUser('target-r')).tokensValidAfterTime;

    await testEnv.wrap(setUserProductionCoordinator)(
      callableRequest(
        { uid: 'target-r', productionCoordinator: false },
        authContext('admin1', { admin: true }),
      ),
    );
    expect((await claimsOf('target-r')).productionCoordinator).toBe(false);
    const after = (await getAuth().getUser('target-r')).tokensValidAfterTime;
    expect(after).not.toBe(before); // refresh tokens revoked on removal
  });

  it('denies non-admin callers — including a director and a coordinator', async () => {
    for (const claims of [
      { approved: true, productionDirector: true },
      { approved: true, productionCoordinator: true },
    ]) {
      await expect(
        testEnv.wrap(setUserProductionCoordinator)(
          callableRequest({ uid: 'x', productionCoordinator: true }, authContext('nope', claims)),
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('syncUserClaims surfaces + mirrors the claim', async () => {
    await getAuth().createUser({
      uid: 'sync-c',
      email: 'sync-c@x.test',
      emailVerified: true,
    });
    await getAuth().setCustomUserClaims('sync-c', { approved: true, productionCoordinator: true });

    const res = await testEnv.wrap(syncUserClaims)(
      callableRequest(
        {},
        authContext('sync-c', {
          approved: true,
          productionCoordinator: true,
          email: 'sync-c@x.test',
          email_verified: true,
        }),
      ),
    );
    expect(res).toMatchObject({ isProductionCoordinator: true });
    expect((await db().doc('users/sync-c').get()).get('productionCoordinator')).toBe(true);
  });
});

describe('assignEventMember — the coordinator auto-enroll branch', () => {
  const coord = () => authContext('coord-1', { approved: true, productionCoordinator: true });

  async function seedTarget(uid: string): Promise<void> {
    await getAuth().createUser({ uid, email: `${uid}@x.test` });
    await db().doc(`users/${uid}`).set({ approved: true });
  }

  beforeEach(async () => {
    await db().doc('users/coord-1').set({ approved: true });
  });

  it('may Tech-auto-enroll (role=tech + ifAbsent) on an event they hold no membership on', async () => {
    await seedTarget('crew-1');
    const res = await testEnv.wrap(assignEventMember)(
      callableRequest({ eventId: EVENT, uid: 'crew-1', role: 'tech', ifAbsent: true }, coord()),
    );
    expect(res).toMatchObject({ uid: 'crew-1', role: 'tech' });
    expect((await db().doc(`events/${EVENT}/members/crew-1`).get()).exists).toBe(true);
  });

  it('ifAbsent stays a no-op against an existing membership — never a downgrade', async () => {
    await seedTarget('pm-existing');
    await db()
      .doc(`events/${EVENT}/members/pm-existing`)
      .set({ role: 'production-manager', uid: 'pm-existing' });

    const res = await testEnv.wrap(assignEventMember)(
      callableRequest(
        { eventId: EVENT, uid: 'pm-existing', role: 'tech', ifAbsent: true },
        coord(),
      ),
    );
    expect(res).toMatchObject({ role: 'production-manager', updated: false });
  });

  it('is denied any other membership write: role assignment, non-ifAbsent, lead role', async () => {
    await seedTarget('crew-2');
    // tech WITHOUT ifAbsent → the ordinary PM/admin gate.
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest({ eventId: EVENT, uid: 'crew-2', role: 'tech' }, coord()),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // A privileged role, even with ifAbsent → denied.
    await expect(
      testEnv.wrap(assignEventMember)(
        callableRequest(
          { eventId: EVENT, uid: 'crew-2', role: 'production-manager', ifAbsent: true },
          coord(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
