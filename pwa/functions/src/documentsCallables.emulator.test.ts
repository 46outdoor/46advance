/**
 * Emulator-backed tests for the docs-broker callable's access gates (Documents PR 4):
 * the artist-library path serves any approved user; the event-document path serves the
 * event's members. Everything up to (not including) the Drive fetch — no SA key exists
 * in the emulator.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getArtistDocumentContent,
  includeArtistDocumentOnAdvance,
  registerArtistDocument,
  registerEventDocument,
} from './index';
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

// S2 registration callables. The Drive fetch/provenance step needs a real Drive client
// (no SA key in the emulator) — it's unit-tested in lib/broker/driveProvenance.test.ts.
// Here: the authorization gates (which run before any Drive call) and the no-Drive
// includeArtistDocumentOnAdvance path end-to-end.
const PM = authContext('pm-uid', { approved: true });
const TECH = authContext('tech-uid', { approved: true });
const ADMIN = authContext('admin-uid', { admin: true, approved: true });

async function seedAdvanceAndLibrary(): Promise<void> {
  await db.doc(`events/${EVENT_ID}`).set({ name: 'Event' });
  await db.doc(`events/${EVENT_ID}/members/${PM.uid}`).set({ role: 'production-manager', uid: PM.uid });
  await db.doc(`events/${EVENT_ID}/members/${TECH.uid}`).set({ role: 'tech', uid: TECH.uid });
  await db.doc(`events/${EVENT_ID}/stages/stg-1`).set({ name: 'Main', order: 0 });
  await db
    .doc(`events/${EVENT_ID}/stages/stg-1/advances/adv-1`)
    .set({ artistName: 'Band', createdBy: PM.uid, sections: {} });
  await db.doc('artistDocuments/lib-1').set({
    fileId: 'lib-1',
    name: 'Rider.pdf',
    displayName: 'Stage Plot',
    mimeType: 'application/pdf',
    iconLink: 'https://icon/x',
    webViewLink: 'https://drive/x',
    categoryId: 'cat-1',
    importedBy: 'admin-1',
  });
}

describe('includeArtistDocumentOnAdvance', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedAdvanceAndLibrary();
  });
  const req = (over: Record<string, string> = {}, ctx = PM) =>
    callableRequest(
      { eventId: EVENT_ID, stageId: 'stg-1', advanceId: 'adv-1', artistDocumentId: 'lib-1', ...over },
      ctx,
    );

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(includeArtistDocumentOnAdvance)(
        callableRequest({ eventId: EVENT_ID, stageId: 'stg-1', advanceId: 'adv-1', artistDocumentId: 'lib-1' }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('a tech (non-editor) cannot include a document', async () => {
    await expect(testEnv.wrap(includeArtistDocumentOnAdvance)(req({}, TECH))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('an unknown library document → not-found', async () => {
    await expect(
      testEnv.wrap(includeArtistDocumentOnAdvance)(req({ artistDocumentId: 'nope' })),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('an unknown advance → not-found', async () => {
    await expect(
      testEnv.wrap(includeArtistDocumentOnAdvance)(req({ advanceId: 'nope' })),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('a PM includes it, copying canonical metadata server-side (doc id = fileId)', async () => {
    await testEnv.wrap(includeArtistDocumentOnAdvance)(req());
    const snap = await db
      .doc(`events/${EVENT_ID}/stages/stg-1/advances/adv-1/documents/lib-1`)
      .get();
    expect(snap.exists).toBe(true);
    const d = snap.data() ?? {};
    expect(d.fileId).toBe('lib-1');
    expect(d.name).toBe('Rider.pdf');
    expect(d.displayName).toBe('Stage Plot');
    expect(d.webViewLink).toBe('https://drive/x');
    expect(d.categoryId).toBe('cat-1');
    expect(d.includePacket).toBe(false);
    expect(d.addedBy).toBe(PM.uid);
  });
});

describe('registerEventDocument — gates (pre-Drive)', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedAdvanceAndLibrary(); // event has NO driveFolderId
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(registerEventDocument)(callableRequest({ eventId: EVENT_ID, fileId: 'f1' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('a tech (non-editor) cannot register', async () => {
    await expect(
      testEnv.wrap(registerEventDocument)(callableRequest({ eventId: EVENT_ID, fileId: 'f1' }, TECH)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('an event with no linked Drive folder is rejected before any Drive call', async () => {
    await expect(
      testEnv.wrap(registerEventDocument)(callableRequest({ eventId: EVENT_ID, fileId: 'f1' }, PM)),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('registerArtistDocument — gates (pre-Drive)', () => {
  beforeEach(async () => {
    await clearEmulators();
    await seedAdvanceAndLibrary(); // no config/documentsLibrary seeded
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(registerArtistDocument)(callableRequest({ fileId: 'f1' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('an approved non-admin/organizer cannot register a library document', async () => {
    await expect(
      testEnv.wrap(registerArtistDocument)(callableRequest({ fileId: 'f1' }, TECH)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('an unconfigured library is rejected before any Drive call', async () => {
    await expect(
      testEnv.wrap(registerArtistDocument)(callableRequest({ fileId: 'f1' }, ADMIN)),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
