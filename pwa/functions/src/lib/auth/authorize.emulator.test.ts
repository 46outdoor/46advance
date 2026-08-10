/**
 * Emulator-backed tests for the event READ gate (`assertCanReadEvent`,
 * planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md). Both halves of the check need live Firestore —
 * the authoritative `users/{uid}` active-user record and the `events/{id}/members/{uid}`
 * row — so this can't live beside the pure token guards in `authorize.test.ts`.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertCanReadEvent } from './authorize';
import { assertCanEditEvent } from '../../google';
import { authContext, clearEmulators } from '../../testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const EVENT_ID = 'evt-read';
const ADMIN = authContext('admin-uid', { admin: true });
const DIRECTOR = authContext('director-uid', { approved: true, productionDirector: true });
const MEMBER = authContext('member-uid', { approved: true });
const OUTSIDER = authContext('outsider-uid', { approved: true });
// Claim says director, but the authoritative record was revoked by an admin.
const REVOKED = authContext('revoked-uid', { approved: true, productionDirector: true });
// Director claim on an account that was never approved.
const PENDING = authContext('pending-uid', { productionDirector: true });

const read = (caller: { uid: string; token: DecodedIdToken }): Promise<void> =>
  assertCanReadEvent(db, caller.token, caller.uid, EVENT_ID);

describe('assertCanReadEvent', () => {
  beforeEach(async () => {
    await clearEmulators();
    await db.doc(`events/${EVENT_ID}`).set({ name: 'Event' });
    await db.doc(`events/${EVENT_ID}/members/${MEMBER.uid}`).set({ role: 'tech', uid: MEMBER.uid });
    // Approved non-admins need an authoritative users record (assertActiveUser, AC-3).
    for (const uid of [DIRECTOR.uid, MEMBER.uid, OUTSIDER.uid, PENDING.uid]) {
      await db.doc(`users/${uid}`).set({ approved: true });
    }
    await db.doc(`users/${REVOKED.uid}`).set({ approved: false });
  });

  it('allows an admin with no membership', async () => {
    await expect(read(ADMIN)).resolves.toBeUndefined();
  });

  it('allows a production director with no membership', async () => {
    await expect(read(DIRECTOR)).resolves.toBeUndefined();
  });

  it('allows a plain member of the event', async () => {
    await expect(read(MEMBER)).resolves.toBeUndefined();
  });

  it('denies an approved outsider with no membership row', async () => {
    await expect(read(OUTSIDER)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies a director whose account was revoked, even with the claim still on the token', async () => {
    await expect(read(REVOKED)).rejects.toThrow(/no longer approved/i);
  });

  it('denies a director claim on an unapproved account', async () => {
    await expect(read(PENDING)).rejects.toThrow(/not approved/i);
  });

  it('treats an absent or false productionDirector claim as no oversight', async () => {
    const absent = authContext(OUTSIDER.uid, { approved: true });
    const explicitFalse = authContext(OUTSIDER.uid, { approved: true, productionDirector: false });
    await expect(read(absent)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(read(explicitFalse)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('does not grant writes — the edit gate still rejects a director', async () => {
    // Guard against someone "simplifying" the two gates into one: a director is not a PM.
    await expect(
      assertCanEditEvent(db, DIRECTOR.token, DIRECTOR.uid, EVENT_ID),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
