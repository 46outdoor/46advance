/**
 * Emulator-backed tests for the docs-broker callable's access gates (Documents PR 4, narrowed
 * by planning/ACCESS_SCOPING_PLAN.md decision 5): the artist-library path serves a caller who
 * may BROWSE the library, or any event member who names an advance the file is included on;
 * the event-document path serves the event's members. Everything up to (not including) the
 * Drive fetch — no SA key exists in the emulator.
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
// Read-only cross-event oversight, with NO membership on this event.
const DIRECTOR = authContext('director-uid', { approved: true, productionDirector: true });

async function seed(): Promise<void> {
  await db.doc(`events/${EVENT_ID}`).set({ name: 'Event' });
  await db.doc(`events/${EVENT_ID}/members/${MEMBER.uid}`).set({ role: 'tech', uid: MEMBER.uid });
  // Approved non-admins need an authoritative users record (assertActiveUser, AC-3).
  await db.doc(`users/${MEMBER.uid}`).set({ approved: true });
  await db.doc(`users/${OUTSIDER.uid}`).set({ approved: true });
  await db.doc(`users/${DIRECTOR.uid}`).set({ approved: true });
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
      testEnv.wrap(getArtistDocumentContent)(
        callableRequest({ fileId: 'efile-1', eventId: EVENT_ID }),
      ),
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

  // A production director passes the read gate on an event they're not a member of: the call
  // reaches the document lookup (not-found for an unknown id) instead of permission-denied.
  // A real fetch can't run here — no docs-broker SA key exists in the emulator.
  it('a production director reaches an event document without membership', async () => {
    await expect(
      testEnv.wrap(getArtistDocumentContent)(
        callableRequest({ fileId: 'nope', eventId: EVENT_ID }, DIRECTOR),
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('an unknown fileId without an eventId stays not-found (library-only path)', async () => {
    await expect(
      testEnv.wrap(getArtistDocumentContent)(callableRequest({ fileId: 'efile-1' }, MEMBER)),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

/**
 * ARTIST-LIBRARY gates (ACCESS_SCOPING_PLAN decision 5).
 *
 * Browsing the library is a global capability, but a crew member must still be able to open a
 * document an editor deliberately included on their advance — otherwise narrowing the library
 * would quietly break the feature's whole point. The broker is what makes that possible, and
 * it must NOT be satisfied by naming an advance the file is not on.
 *
 * No Drive fetch can complete here (no SA key), so "allowed" is asserted as *not*
 * permission-denied: authorization passed and the handler moved on to fetching bytes.
 */
describe('getArtistDocumentContent — artist-library gates', () => {
  const COORDINATOR = authContext('coord-uid', { approved: true, productionCoordinator: true });

  beforeEach(async () => {
    await clearEmulators();
    await seedAdvanceAndLibrary();
    await db.doc(`users/${COORDINATOR.uid}`).set({ approved: true });
    await db.doc(`users/${OUTSIDER.uid}`).set({ approved: true });
    // 'lib-1' is included on the advance; 'lib-2' exists in the library but is not.
    await db.doc(`events/${EVENT_ID}/stages/stg-1/advances/adv-1/documents/lib-1`).set({
      fileId: 'lib-1',
      name: 'Rider.pdf',
      webViewLink: 'https://drive/x',
      addedBy: PM.uid,
    });
    await db.doc('artistDocuments/lib-2').set({
      fileId: 'lib-2',
      name: 'Other.pdf',
      webViewLink: 'https://drive/y',
      importedBy: 'admin-1',
    });
  });

  /** The rejection's error code, or null when the call somehow succeeded. */
  async function denial(data: Record<string, string>, ctx = TECH): Promise<string | null> {
    try {
      await testEnv.wrap(getArtistDocumentContent)(callableRequest(data, ctx));
      return null;
    } catch (err) {
      return (err as { code?: string }).code ?? 'non-https-error';
    }
  }

  const onAdvance = { eventId: EVENT_ID, stageId: 'stg-1', advanceId: 'adv-1' };

  it('refuses a plain member asking for a library file with no advance context', async () => {
    expect(await denial({ fileId: 'lib-1' })).toBe('permission-denied');
  });

  it('lets a plain member open a library file INCLUDED on their advance', async () => {
    expect(await denial({ fileId: 'lib-1', ...onAdvance })).not.toBe('permission-denied');
  });

  it('refuses a library file that is NOT included on the named advance', async () => {
    // The inclusion record is the whole authorization. Without this, naming any advance you
    // can read would unlock the entire library.
    expect(await denial({ fileId: 'lib-2', ...onAdvance })).toBe('permission-denied');
  });

  it('refuses a member of a DIFFERENT event who names this advance', async () => {
    expect(await denial({ fileId: 'lib-1', ...onAdvance }, OUTSIDER)).toBe('permission-denied');
  });

  it('lets a browsing capability through with no advance context at all', async () => {
    expect(await denial({ fileId: 'lib-1' }, ADMIN)).not.toBe('permission-denied');
    expect(await denial({ fileId: 'lib-2' }, COORDINATOR)).not.toBe('permission-denied');
  });

  it('rejects a half-specified advance path instead of silently weakening the check', async () => {
    expect(await denial({ fileId: 'lib-1', eventId: EVENT_ID, stageId: 'stg-1' })).toBe(
      'invalid-argument',
    );
    expect(await denial({ fileId: 'lib-1', eventId: EVENT_ID, advanceId: 'adv-1' })).toBe(
      'invalid-argument',
    );
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
  await db
    .doc(`events/${EVENT_ID}/members/${PM.uid}`)
    .set({ role: 'production-manager', uid: PM.uid });
  await db.doc(`events/${EVENT_ID}/members/${TECH.uid}`).set({ role: 'tech', uid: TECH.uid });
  // Approved non-admins need an authoritative users record (assertActiveUser, AC-3).
  await db.doc(`users/${PM.uid}`).set({ approved: true });
  await db.doc(`users/${TECH.uid}`).set({ approved: true });
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
      {
        eventId: EVENT_ID,
        stageId: 'stg-1',
        advanceId: 'adv-1',
        artistDocumentId: 'lib-1',
        ...over,
      },
      ctx,
    );

  it('rejects unauthenticated calls', async () => {
    await expect(
      testEnv.wrap(includeArtistDocumentOnAdvance)(
        callableRequest({
          eventId: EVENT_ID,
          stageId: 'stg-1',
          advanceId: 'adv-1',
          artistDocumentId: 'lib-1',
        }),
      ),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('a tech (non-editor) cannot include a document', async () => {
    await expect(testEnv.wrap(includeArtistDocumentOnAdvance)(req({}, TECH))).rejects.toMatchObject(
      {
        code: 'permission-denied',
      },
    );
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
      testEnv.wrap(registerEventDocument)(
        callableRequest({ eventId: EVENT_ID, fileId: 'f1' }, TECH),
      ),
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
