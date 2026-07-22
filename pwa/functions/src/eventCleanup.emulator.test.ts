/**
 * Emulator tests for the recursive-deletion callables (S10/F-7): the Firestore subtree is removed
 * in full, the PM/admin gate is enforced, and re-running after a partial failure is safe.
 * Storage cleanup is best-effort and needs no Storage emulator, so it's mocked to a no-op here.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ deleteFiles: () => Promise.resolve([[]]) }) }),
}));

import { deleteAdvance, deleteStage, deleteQuote } from './eventCleanup';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const PM = authContext('pm-uid', { approved: true });
const TECH = authContext('tech-uid', { approved: true });
const E = 'evt-del';
const S = 'stg-1';
const A = 'adv-1';
const advPath = `events/${E}/stages/${S}/advances/${A}`;

async function seed(): Promise<void> {
  await db.doc(`events/${E}`).set({ name: 'E' });
  await db.doc(`events/${E}/members/${PM.uid}`).set({ role: 'production-manager', uid: PM.uid });
  await db.doc(`events/${E}/members/${TECH.uid}`).set({ role: 'tech', uid: TECH.uid });
  // Approved non-admins need an authoritative users record (assertActiveUser, AC-3).
  await db.doc(`users/${PM.uid}`).set({ approved: true });
  await db.doc(`users/${TECH.uid}`).set({ approved: true });
  await db.doc(`events/${E}/stages/${S}`).set({ name: 'Main', order: 0 });
  await db.doc(advPath).set({ artistName: 'Band', createdBy: PM.uid });
  // Subcollections a client-side delete can't fully reach (driveFiles is server-write-only).
  await db.doc(`${advPath}/driveFiles/f1`).set({ fileId: 'f1' });
  await db.doc(`${advPath}/documents/d1`).set({ fileId: 'd1' });
  await db.doc(`${advPath}/quotes/q1`).set({ title: 'Q', createdBy: PM.uid });
}

const exists = async (path: string): Promise<boolean> => (await db.doc(path).get()).exists;

describe('deleteAdvance', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seed();
  });

  it('rejects a non-editor (tech); the advance survives', async () => {
    await expect(
      testEnv.wrap(deleteAdvance)(callableRequest({ eventId: E, stageId: S, advanceId: A }, TECH)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await exists(advPath)).toBe(true);
  });

  it('recursively deletes the advance and every subcollection, and is idempotent', async () => {
    await testEnv.wrap(deleteAdvance)(callableRequest({ eventId: E, stageId: S, advanceId: A }, PM));
    expect(await exists(advPath)).toBe(false);
    expect(await exists(`${advPath}/driveFiles/f1`)).toBe(false);
    expect(await exists(`${advPath}/documents/d1`)).toBe(false);
    expect(await exists(`${advPath}/quotes/q1`)).toBe(false);
    // Retrying a timed-out delete is safe.
    await expect(
      testEnv.wrap(deleteAdvance)(callableRequest({ eventId: E, stageId: S, advanceId: A }, PM)),
    ).resolves.toEqual({ ok: true });
  });
});

describe('deleteStage', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seed();
    await db.doc(`events/${E}/stages/${S}/production/record`).set({ info: {} });
    await db.doc(`events/${E}/stages/${S}/production/record/attachments/at1`).set({ path: 'p', name: 'a' });
  });

  it('recursively deletes the stage, its advances subtree, and the production record + attachments', async () => {
    await testEnv.wrap(deleteStage)(callableRequest({ eventId: E, stageId: S }, PM));
    expect(await exists(`events/${E}/stages/${S}`)).toBe(false);
    expect(await exists(advPath)).toBe(false);
    expect(await exists(`${advPath}/quotes/q1`)).toBe(false);
    expect(await exists(`events/${E}/stages/${S}/production/record/attachments/at1`)).toBe(false);
  });
});

describe('deleteQuote', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seed();
  });

  it('rejects a non-editor, then a PM deletes the quote', async () => {
    await expect(
      testEnv.wrap(deleteQuote)(callableRequest({ eventId: E, stageId: S, advanceId: A, quoteId: 'q1' }, TECH)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await testEnv.wrap(deleteQuote)(callableRequest({ eventId: E, stageId: S, advanceId: A, quoteId: 'q1' }, PM));
    expect(await exists(`${advPath}/quotes/q1`)).toBe(false);
  });
});
