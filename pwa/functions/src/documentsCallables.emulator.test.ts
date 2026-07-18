/**
 * Emulator-backed tests for the docs-broker callable's access gates (Documents PR 4):
 * the artist-library path serves any approved user; the event-document path serves the
 * event's members. Everything up to (not including) the Drive fetch — no SA key exists
 * in the emulator.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import { getArtistDocumentContent } from './index';
import { authContext, callableRequest, clearEmulators, testEnv } from './testing/emulatorHarness';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const EVENT_ID = 'evt-docs';
const MEMBER = authContext('member-uid', { approved: true });
const OUTSIDER = authContext('outsider-uid', { approved: true });

async function seed(): Promise<void> {
  await db.doc(`events/${EVENT_ID}`).set({ name: 'Event' });
  await db.doc(`events/${EVENT_ID}/members/${MEMBER.uid}`).set({ role: 'tech', uid: MEMBER.uid });
  await db.doc(`events/${EVENT_ID}/documents/efile-1`).set({
    fileId: 'efile-1',
    name: 'SitePlan.pdf',
    webViewLink: 'https://drive/x',
    day: null,
    uploadedBy: 'pm-uid',
  });
}

describe('getArtistDocumentContent — event-document gates', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seed();
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(getArtistDocumentContent)(callableRequest({ fileId: 'efile-1', eventId: EVENT_ID })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('a non-member cannot reach an event document', async () => {
    await expect(
      testEnv.wrap(getArtistDocumentContent)(
        callableRequest({ fileId: 'efile-1', eventId: EVENT_ID }, OUTSIDER),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('a member asking for an unknown event document gets not-found', async () => {
    await expect(
      testEnv.wrap(getArtistDocumentContent)(
        callableRequest({ fileId: 'nope', eventId: EVENT_ID }, MEMBER),
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('an unknown fileId without an eventId stays not-found (library-only path)', async () => {
    await expect(
      testEnv.wrap(getArtistDocumentContent)(callableRequest({ fileId: 'efile-1' }, MEMBER)),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
