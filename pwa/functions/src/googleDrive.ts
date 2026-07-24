/**
 * Phase 13 — Google Drive (per-user OAuth, reuses 11b). Least-privilege `drive.file`:
 * the app only touches files the user picks via the Google Picker (the pick grants our
 * OAuth client per-file access) or files the app creates. Every callable runs as the
 * signed-in user (their stored refresh token), gated to event members / PMs.
 *
 *   - getDriveAccessToken : mint a short-lived access token for the client-side Picker.
 *   - linkDriveFile       : validate access + capture canonical metadata into the advance's driveFiles subcollection.
 *   - removeDriveFile     : drop a linked file (does NOT delete it from Drive).
 *   - savePacketToDrive   : copy a generated packet (Storage) into the caller's Drive.
 *
 * The `driveFiles/{fileId}` subcollection is written ONLY here (Admin SDK) — firestore.rules
 * rejects client writes — so a stored link is always a real, server-validated
 * `drive.google.com` URL (no spoofing).
 */
import { Readable } from 'node:stream';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { google, type drive_v3 } from 'googleapis';
import {
  OAUTH_SECRETS,
  TIME_ZONE,
  type AuthClient,
  authedClientForUser,
  assertCanEditEvent,
} from './google.js';
import { assertActiveUser } from './lib/auth/authorize.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import { withGoogleRetry } from './lib/google/retry.js';
import { fetchBrokeredFileBytes, MAX_INTERACTIVE_CONTENT_BYTES } from './lib/broker/brokerFetch.js';
import { packetBaseName } from './lib/pdf/packetFilename.js';
import {
  classifyFolderFile,
  driveErrorReason,
  getFileForRegistration,
  resolveArtistFolder,
} from './lib/broker/driveProvenance.js';
import {
  getArtistDocumentContentInputSchema,
  importDriveFolderInputSchema,
  includeAdvanceDocumentInputSchema,
  linkDriveFileInputSchema,
  registerArtistDocumentInputSchema,
  registerEventDocumentInputSchema,
  removeDriveFileInputSchema,
  savePacketToDriveInputSchema,
  validateLibraryFolderInputSchema,
} from './contracts/callables/googleDrive.js';

const STORAGE_BUCKET = 'advancethat.firebasestorage.app';
const FILE_FIELDS = 'id,name,mimeType,webViewLink,iconLink';

function advancePath(eventId: string, stageId: string, advanceId: string): string {
  return `events/${eventId}/stages/${stageId}/advances/${advanceId}`;
}

export const DRIVE_SA_KEY = defineSecret('DRIVE_SA_KEY');

/** A read-only Drive client authenticated as the docs-broker service account (the artist-docs
 * folder is shared with it). Lets approved techs view files they can't open in Drive directly. */
export function brokerDriveClient(): drive_v3.Drive {
  const credentials = JSON.parse(DRIVE_SA_KEY.value()) as Record<string, unknown>;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Short-lived OAuth access token for the browser Picker. Refresh tokens stay server-side; only a
 * transient (~1h) access token is handed to the client.
 *
 * NOTE (P2-15, partly addressed): this token carries ALL scopes the user granted at connect
 * (calendar + drive.file), not `drive.file` alone — a user OAuth access token can't be
 * scope-narrowed from its refresh token. The blast radius shrank when `drive.metadata.readonly`
 * was dropped from the grant, so the token no longer carries any Drive-wide read. Fully
 * down-scoping the Picker would still need a SEPARATE drive.file-only OAuth grant (a second
 * consent + refresh token), forcing every user to re-consent; left as a product decision.
 */
export const getDriveAccessToken = onCall(
  { secrets: OAUTH_SECRETS, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    await assertActiveUser(request.auth);
    const db = getFirestore();
    await enforceRateLimit(db, ['getDriveAccessToken', request.auth.uid], 30);
    const client = await authedClientForUser(db, request.auth.uid); // throws failed-precondition if not connected
    const { token } = await client.getAccessToken();
    if (!token)
      throw new HttpsError('failed-precondition', 'Could not obtain a Drive access token.');
    return { accessToken: token };
  },
);

/**
 * Link a Picker-selected Drive file to an advance (admin or event PM). Validates access via
 * `drive.files.get` and stores Google's canonical metadata — clients never write the link.
 * Input: { eventId, stageId, advanceId, fileId }.
 */
export const linkDriveFile = onCall(
  { secrets: OAUTH_SECRETS, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    const { eventId, stageId, advanceId, fileId } = parseCallableData(
      linkDriveFileInputSchema,
      request.data,
    );
    const db = getFirestore();
    await enforceRateLimit(db, ['linkDriveFile', uid], 30);
    await assertCanEditEvent(db, token, uid, eventId);

    const ref = db.doc(advancePath(eventId, stageId, advanceId));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Advance not found.');

    const client = await authedClientForUser(db, uid);
    const drive = google.drive({ version: 'v3', auth: client });
    let file: drive_v3.Schema$File;
    try {
      const res = await drive.files.get({ fileId, fields: FILE_FIELDS, supportsAllDrives: true });
      file = res.data;
    } catch {
      throw new HttpsError(
        'not-found',
        'Could not access that Drive file — re-pick it from the Drive picker.',
      );
    }
    if (!file.id || !file.name || !file.webViewLink) {
      throw new HttpsError('internal', 'Drive returned incomplete file metadata.');
    }

    const entry = {
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType ?? 'application/octet-stream',
      iconLink: file.iconLink ?? null,
      webViewLink: file.webViewLink,
      linkedByUid: uid,
      linkedByEmail: token.email ?? null,
      linkedAt: Timestamp.now(),
    };
    // One doc per file in the driveFiles subcollection (doc id = Drive file id, so
    // re-linking the same file is idempotent) — no read-modify-write of a shared array.
    await ref.collection('driveFiles').doc(file.id).set(entry);
    return { ok: true };
  },
);

/**
 * Unlink a Drive file from an advance (admin or event PM). Removes the reference only —
 * the file itself stays in the owner's Drive. Input: { eventId, stageId, advanceId, fileId }.
 */
export const removeDriveFile = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, fileId } = parseCallableData(
    removeDriveFileInputSchema,
    request.data,
  );
  const db = getFirestore();
  await enforceRateLimit(db, ['removeDriveFile', uid], 30);
  await assertCanEditEvent(db, token, uid, eventId);

  const ref = db.doc(advancePath(eventId, stageId, advanceId));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Advance not found.');
  await ref.collection('driveFiles').doc(fileId).delete();
  return { ok: true };
});

/** List a folder's immediate children (folders, or non-folders), paging through all results. */
async function listChildren(
  drive: drive_v3.Drive,
  parentId: string,
  foldersOnly: boolean,
): Promise<drive_v3.Schema$File[]> {
  const folderType = "mimeType = 'application/vnd.google-apps.folder'";
  const typeClause = foldersOnly ? folderType : `not ${folderType}`;
  const q = `'${parentId}' in parents and ${typeClause} and trashed = false`;
  const out: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withGoogleRetry(
      () =>
        drive.files.list({
          q,
          fields: 'nextPageToken, files(id,name,mimeType,iconLink,webViewLink)',
          spaces: 'drive',
          pageSize: 200,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      { label: 'drive.files.list' },
    );
    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Normalize an artist name to a key (mirrors pwa src/lib/documents/artistDocument.ts). */
function artistKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const MAX_FOLDER_DEPTH = 12;

/** All files anywhere under a folder — recurses into nested subfolders (depth-capped). */
async function collectAllFiles(
  drive: drive_v3.Drive,
  folderId: string,
  depth: number,
): Promise<drive_v3.Schema$File[]> {
  const files = await listChildren(drive, folderId, false);
  if (depth >= MAX_FOLDER_DEPTH) return files;
  const subfolders = await listChildren(drive, folderId, true);
  const nested = await Promise.all(
    subfolders.filter((f) => f.id).map((f) => collectAllFiles(drive, f.id as string, depth + 1)),
  );
  return [...files, ...nested.flat()];
}

/**
 * Import an artist-documents Drive folder into the `artistDocuments` library (admin|organizer).
 * Each immediate subfolder is an artist; its ENTIRE subtree (nested subfolders included) is imported
 * under that artist. Files directly in the picked folder are unsorted. Files are linked (metadata
 * only), de-duped by Drive file id so re-import only adds new files and preserves classifications.
 * Does NOT set the mirrored library root — that is admin-managed (config/documentsLibrary).
 */
// 512 MiB (not the 256 MiB default): enumerates the whole library into memory like
// scheduledLibraryDriveSync (already 512 MiB). At the default this OOMs once the library grows.
export const importDriveFolder = onCall(
  { secrets: [DRIVE_SA_KEY], timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    await assertActiveUser({ uid, token });
    if (token.admin !== true && token.organizer !== true) {
      throw new HttpsError('permission-denied', 'Admin or organizer only.');
    }
    // A legacy `folderId` from an older client is accepted and ignored — the folder to mirror is
    // the admin-configured library root, never an ad-hoc pick.
    parseCallableData(importDriveFolderInputSchema, request.data);
    const db = getFirestore();
    await enforceRateLimit(db, ['importDriveFolder', uid], 10);

    const root = (await db.doc('config/documentsLibrary').get()).data()?.rootFolderId;
    if (typeof root !== 'string' || !root) {
      throw new HttpsError(
        'failed-precondition',
        'No document library folder is set — choose one in Admin → Document library first.',
      );
    }

    // Enumerate as the docs-broker service account, exactly as scheduledLibraryDriveSync does.
    // This is why the user grant needs no Drive-wide read: dropping drive.metadata.readonly (a
    // RESTRICTED scope) keeps the app off Google's security-assessment verification track.
    const drive = brokerDriveClient();
    const enumerated = await enumerateLibrary(drive, root).catch(() => null);
    if (!enumerated) {
      throw new HttpsError(
        'failed-precondition',
        'Could not read the library folder — make sure it is still shared with the document viewer account.',
      );
    }

    // Only reconcile removals when enumeration completed, so a mid-run Drive glitch can't
    // false-flag files as missing.
    const counts = await upsertLibrary(
      db,
      enumerated.groups,
      { uid, email: token.email ?? null },
      enumerated.complete,
    );
    return { imported: counts.imported, skipped: counts.skipped };
  },
);

interface LibraryGroup {
  artist: string | null;
  folderId: string;
  files: drive_v3.Schema$File[];
}

/** Enumerate the library tree: files directly in the root are "unsorted"; each subfolder
 * is an artist whose ENTIRE subtree (nested subfolders included) belongs to that artist.
 * Each group records its Drive folder id — the upload target for new files. */
async function enumerateLibrary(
  drive: drive_v3.Drive,
  rootFolderId: string,
  subfolders?: drive_v3.Schema$File[],
): Promise<{ groups: LibraryGroup[]; complete: boolean }> {
  const folders = subfolders ?? (await listChildren(drive, rootFolderId, true));
  const rootFiles = await listChildren(drive, rootFolderId, false);
  const groups: LibraryGroup[] = [{ artist: null, folderId: rootFolderId, files: rootFiles }];
  // Enumerate each artist folder independently: a transient Drive error on one folder is logged and
  // that folder skipped (complete=false) instead of aborting the whole sweep. An INCOMPLETE
  // enumeration must NOT drive the missing-from-Drive reconciliation — it would false-flag the
  // skipped folder's files as removed — so the caller gates that on `complete` (WS-H).
  let complete = true;
  const enumerated = await Promise.all(
    folders
      .filter((f) => f.id)
      .map(async (f): Promise<LibraryGroup | null> => {
        try {
          return {
            artist: f.name ?? 'Unknown',
            folderId: f.id as string,
            files: await collectAllFiles(drive, f.id as string, 0),
          };
        } catch (e) {
          logger.warn('Library sync: skipping a folder that failed to enumerate', {
            folderId: f.id,
            error: String(e),
          });
          return null;
        }
      }),
  );
  for (const g of enumerated) {
    if (g) groups.push(g);
    else complete = false;
  }
  return { groups, complete };
}

/** Upsert enumerated library files into `artistDocuments`: new files become records
 * (unclassified), existing ones get their `sourceFolderId` backfilled (classifications
 * and edits untouched), and the missing-from-Drive flag reconciles both ways — records
 * whose files vanished are FLAGGED (never deleted; a move looks identical to a delete),
 * and flagged records whose files reappear are cleared. */
async function upsertLibrary(
  db: Firestore,
  groups: readonly LibraryGroup[],
  attribution: { uid: string; email: string | null },
  reconcileMissing = true,
): Promise<{ imported: number; skipped: number; flagged: number; restored: number }> {
  const existingSnap = await db.collection('artistDocuments').get();
  const existingDocs = new Map(existingSnap.docs.map((d) => [d.id, d.data()]));
  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;
  let flagged = 0;
  let restored = 0;
  let batch = db.batch();
  let ops = 0;
  const bump = async () => {
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };
  for (const group of groups) {
    for (const file of group.files) {
      if (!file.id || !file.name || !file.webViewLink || seen.has(file.id)) continue;
      seen.add(file.id);
      const ref = db.collection('artistDocuments').doc(file.id);
      const current = existingDocs.get(file.id);
      if (current) {
        const patch: Record<string, unknown> = { sourceFolderId: group.folderId };
        if (current.missingFromDrive === true) {
          patch.missingFromDrive = false;
          patch.missingAt = null; // reappeared — clear the removal timestamp
          restored += 1;
        }
        batch.set(ref, patch, { merge: true });
        skipped += 1;
      } else {
        batch.set(ref, {
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType ?? 'application/octet-stream',
          iconLink: file.iconLink ?? null,
          webViewLink: file.webViewLink,
          artist: group.artist,
          artistKey: group.artist ? artistKey(group.artist) : null,
          categoryId: null,
          sourceFolderId: group.folderId,
          importedBy: attribution.uid,
          importedByEmail: attribution.email,
          importedAt: Timestamp.now(),
        });
        imported += 1;
      }
      await bump();
    }
  }
  // Only reconcile removals when the enumeration was COMPLETE — a partial sweep (a folder failed, or
  // an import of just one subfolder) must not flag everything it didn't see as missing (WS-H).
  if (reconcileMissing) {
    for (const [id, data] of existingDocs) {
      if (seen.has(id) || data.missingFromDrive === true) continue;
      // First sync that no longer sees the file — record WHEN it went missing (the loop skips docs
      // already flagged, so this stamps the transition once and isn't overwritten on later syncs).
      batch.set(
        db.collection('artistDocuments').doc(id),
        { missingFromDrive: true, missingAt: Timestamp.now() },
        { merge: true },
      );
      flagged += 1;
      await bump();
    }
  }
  if (ops > 0) await batch.commit();
  return { imported, skipped, flagged, restored };
}

/**
 * Scheduled library ⇄ Drive sync: twice daily (midnight + noon Central), enumerate the
 * recorded library root via the docs-broker service account — no user OAuth involved —
 * so files added to artist folders directly in Drive appear in the app (unclassified),
 * and deleted/moved files get flagged. No-op until an import has recorded the root.
 */
export const scheduledLibraryDriveSync = onSchedule(
  {
    schedule: '0 0,12 * * *',
    timeZone: TIME_ZONE,
    secrets: [DRIVE_SA_KEY],
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const db = getFirestore();
    const root = (await db.doc('config/documentsLibrary').get()).data()?.rootFolderId;
    if (typeof root !== 'string' || !root) {
      logger.info('Library Drive sync skipped — no root folder recorded yet.');
      return;
    }
    // Whole-run guard (WS-H): a root-level failure logs cleanly instead of crashing the function;
    // per-folder failures inside enumerateLibrary are already isolated + gate removal reconciliation.
    try {
      const drive = brokerDriveClient();
      const { groups, complete } = await enumerateLibrary(drive, root);
      const counts = await upsertLibrary(db, groups, { uid: 'drive-sync', email: null }, complete);
      logger.info('Library Drive sync complete', { ...counts, complete });
    } catch (e) {
      logger.error('Library Drive sync failed', { error: String(e) });
    }
  },
);

/**
 * Validate a candidate document-library root folder before an admin saves it (admin only).
 * Looks the id up via the docs-broker service account — the same identity the twice-daily sync
 * uses — so a typo'd or unshared id is caught up front instead of silently breaking the sync.
 * Returns a discriminated result: { ok:true, name } when it's a real, accessible, non-trashed
 * Drive FOLDER; otherwise { ok:false, reason }. Raw Drive errors are logged, never returned.
 * Input: { folderId }.
 */
export const validateLibraryFolder = onCall(
  { secrets: [DRIVE_SA_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    await assertActiveUser({ uid, token });
    if (token.admin !== true) throw new HttpsError('permission-denied', 'Admin only.');
    const { folderId } = parseCallableData(validateLibraryFolderInputSchema, request.data);
    const db = getFirestore();
    await enforceRateLimit(db, ['validateLibraryFolder', uid], 30);

    const drive = brokerDriveClient();
    try {
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType,trashed',
        supportsAllDrives: true,
      });
      return classifyFolderFile(res.data);
    } catch (err) {
      // Map to a coarse reason (never leak raw Drive error text to the client); log the detail.
      logger.warn('validateLibraryFolder: Drive lookup failed', { folderId, error: String(err) });
      return { ok: false, reason: driveErrorReason(err) };
    }
  },
);

/** A 403/404 from Drive under `drive.file` means this user's grant doesn't cover the folder. */
function isDriveAccessError(e: unknown): boolean {
  const err = e as { code?: number | string; status?: number; response?: { status?: number } };
  const code = Number(err?.code ?? err?.status ?? err?.response?.status);
  return code === 403 || code === 404;
}

/**
 * Save the event's generated packet into its LINKED Drive folder, replacing the previous one so the
 * file id + link stay stable. PM-gated (admin or the event production manager). Runs on the caller's
 * own Drive token — the docs-broker service account has no Drive storage and can't own files in My
 * Drive — so the folder must have been linked/picked in-app by this PM. When their grant doesn't
 * cover it yet, we return `{ saved: false, reason: 'no_folder_access' }` and the client re-grants via
 * the Picker, then retries. On success we record the packet on the event for a "view current" link.
 * Input: { eventId, path } — `path` is the Storage path returned by generatePacket.
 */
export const savePacketToDrive = onCall(
  { secrets: OAUTH_SECRETS, timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    const { eventId, path } = parseCallableData(savePacketToDriveInputSchema, request.data);
    // Confine to this event's packets — no traversal to other events or objects.
    if (!path.startsWith(`events/${eventId}/packets/`) || path.includes('..')) {
      throw new HttpsError('invalid-argument', 'Invalid packet path.');
    }
    const db = getFirestore();
    await enforceRateLimit(db, ['savePacketToDrive', uid], 10);
    await assertCanEditEvent(db, token, uid, eventId);

    const eventSnap = await db.doc(`events/${eventId}`).get();
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
    const eventData = eventSnap.data() ?? {};
    const folderId = typeof eventData.driveFolderId === 'string' ? eventData.driveFolderId : '';
    if (!folderId) {
      throw new HttpsError(
        'failed-precondition',
        'This event has no linked Drive folder — add one on the event, then save.',
      );
    }
    const fileName = `${await packetBaseName(db, eventData)}.pdf`;

    const fileRef = getStorage().bucket(STORAGE_BUCKET).file(path);
    const [exists] = await fileRef.exists();
    if (!exists) throw new HttpsError('not-found', 'Packet file not found — generate it first.');

    let client: AuthClient;
    try {
      client = await authedClientForUser(db, uid);
    } catch {
      return { saved: false, reason: 'not_connected' };
    }
    const drive = google.drive({ version: 'v3', auth: client });
    const [buffer] = await fileRef.download();

    // Look for an existing packet of the same name to replace. Under `drive.file` an empty result
    // can also mean the folder isn't in this user's grant yet — the create below then 404s.
    const escaped = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let existing: string[] = [];
    try {
      const list = await withGoogleRetry(
        () =>
          drive.files.list({
            q: `'${folderId}' in parents and name = '${escaped}' and trashed = false`,
            fields: 'files(id)',
            pageSize: 10,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          }),
        { label: 'drive.files.list(packet)' },
      );
      existing = (list.data.files ?? []).map((f) => f.id).filter((x): x is string => Boolean(x));
    } catch {
      existing = [];
    }

    try {
      let fileId = '';
      let webViewLink: string | null = null;
      if (existing.length > 0) {
        const [keep, ...dupes] = existing;
        const updated = await withGoogleRetry(
          () =>
            drive.files.update({
              fileId: keep,
              media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
              fields: 'id,webViewLink',
              supportsAllDrives: true,
            }),
          { label: 'drive.files.update(packet)' },
        );
        fileId = updated.data.id ?? keep;
        webViewLink = updated.data.webViewLink ?? null;
        // Collapse any stray duplicates so exactly one current packet remains.
        for (const d of dupes) {
          await drive.files.delete({ fileId: d, supportsAllDrives: true }).catch(() => undefined);
        }
      } else {
        const created = await withGoogleRetry(
          () =>
            drive.files.create({
              requestBody: { name: fileName, parents: [folderId] },
              media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
              fields: 'id,webViewLink',
              supportsAllDrives: true,
            }),
          { label: 'drive.files.create(packet)' },
        );
        fileId = created.data.id ?? '';
        webViewLink = created.data.webViewLink ?? null;
      }

      if (fileId && webViewLink) {
        await db
          .doc(`events/${eventId}`)
          .set({ packetDrive: { fileId, webViewLink, savedAt: Timestamp.now() } }, { merge: true });
      }
      return { saved: true, webViewLink, fileId: fileId || null };
    } catch (e) {
      if (isDriveAccessError(e)) return { saved: false, reason: 'no_folder_access' };
      logger.error('Packet save to Drive failed', { error: String(e) });
      throw new HttpsError('internal', 'Could not save the packet to Drive.');
    }
  },
);

/**
 * Serve an artist document's bytes to an approved user via the docs-broker service account, so
 * techs can view files in permission-gated Drive folders they can't open directly. The fileId
 * must be a known artistDocument (its doc id = the Drive file id). Returns base64 + mime + name.
 */
export const getArtistDocumentContent = onCall(
  { secrets: [DRIVE_SA_KEY], timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    await assertActiveUser({ uid, token });
    const { fileId, eventId } = parseCallableData(
      getArtistDocumentContentInputSchema,
      request.data,
    );
    const db = getFirestore();
    await enforceRateLimit(db, ['getArtistDocumentContent', uid], 120);
    // Artist-library docs serve any approved user (matches the library's read rules);
    // with an eventId, an event document serves that event's members (PR 4).
    let snap = await db.collection('artistDocuments').doc(fileId).get();
    if (!snap.exists && eventId) {
      const isMember =
        token.admin === true || (await db.doc(`events/${eventId}/members/${uid}`).get()).exists;
      if (!isMember) throw new HttpsError('permission-denied', 'Not a member of this event.');
      snap = await db.doc(`events/${eventId}/documents/${fileId}`).get();
    }
    if (!snap.exists) throw new HttpsError('not-found', 'Unknown document.');
    const doc = snap.data() ?? {};
    const storedMime = typeof doc.mimeType === 'string' ? doc.mimeType : '';

    const drive = brokerDriveClient();
    // Cap the interactive response: binary files preflight/Range-bound inside the fetch;
    // Google-native exports (no size until exported) are caught by the post-hoc length
    // check. Either way an oversized document is rejected before it can be base64-encoded
    // into an over-limit callable response.
    const result = await fetchBrokeredFileBytes(
      drive,
      fileId,
      storedMime,
      MAX_INTERACTIVE_CONTENT_BYTES,
    );
    if ('tooLarge' in result || result.data.length > MAX_INTERACTIVE_CONTENT_BYTES) {
      throw new HttpsError(
        'failed-precondition',
        'This document is too large to open in the app. Open it directly in Google Drive.',
      );
    }
    return {
      base64: result.data.toString('base64'),
      mimeType: result.mimeType,
      name: typeof doc.name === 'string' ? doc.name : 'document',
    };
  },
);

/**
 * Register a Drive file uploaded into an event's linked folder as an event document
 * (admin or event PM). Verifies server-side — with the caller's OAuth — that the file
 * actually lives in the event's recorded Drive folder, and captures Google's canonical
 * metadata; clients no longer assert the file id or its display metadata (F-1 hardening).
 * Input: { eventId, fileId, displayName?, day?, categoryId? }.
 */
export const registerEventDocument = onCall(
  { secrets: OAUTH_SECRETS, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    const { eventId, fileId, displayName, day, categoryId } = parseCallableData(
      registerEventDocumentInputSchema,
      request.data,
    );
    const db = getFirestore();
    await enforceRateLimit(db, ['registerEventDocument', uid], 60);
    await assertCanEditEvent(db, token, uid, eventId);

    const driveFolderId = (await db.doc(`events/${eventId}`).get()).get('driveFolderId');
    if (typeof driveFolderId !== 'string' || !driveFolderId) {
      throw new HttpsError('failed-precondition', 'This event has no linked Drive folder.');
    }

    const client = await authedClientForUser(db, uid);
    const file = await getFileForRegistration(
      google.drive({ version: 'v3', auth: client }),
      fileId,
    );
    if (!file)
      throw new HttpsError(
        'not-found',
        'Could not access that Drive file — re-pick it from the picker.',
      );
    if (!file.parents.includes(driveFolderId)) {
      throw new HttpsError('permission-denied', "That file is not in this event's Drive folder.");
    }

    await db.doc(`events/${eventId}/documents/${file.id}`).set({
      fileId: file.id,
      name: file.name,
      displayName: displayName?.trim() ? displayName.trim() : null,
      mimeType: file.mimeType,
      iconLink: file.iconLink,
      webViewLink: file.webViewLink,
      day: day ?? null,
      categoryId: categoryId ?? null,
      uploadedBy: uid,
      uploadedAt: Timestamp.now(),
    });
    return { ok: true };
  },
);

/**
 * Register a Drive file uploaded into the artist library as a library document (admin or
 * organizer). Verifies — with the docs-broker SA — that the file lives under the recorded
 * library root folder, and derives the artist + metadata from Drive; clients no longer
 * assert the file id, its metadata, or the artist (F-1 hardening). Input: { fileId }.
 */
export const registerArtistDocument = onCall(
  { secrets: [DRIVE_SA_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
    const { uid, token } = request.auth;
    await assertActiveUser({ uid, token });
    if (token.admin !== true && token.organizer !== true) {
      throw new HttpsError('permission-denied', 'Admin or organizer only.');
    }
    const { fileId } = parseCallableData(registerArtistDocumentInputSchema, request.data);
    const db = getFirestore();
    await enforceRateLimit(db, ['registerArtistDocument', uid], 60);

    const rootFolderId = (await db.doc('config/documentsLibrary').get()).get('rootFolderId');
    if (typeof rootFolderId !== 'string' || !rootFolderId) {
      throw new HttpsError(
        'failed-precondition',
        'The document library has not been configured yet.',
      );
    }

    const drive = brokerDriveClient();
    const file = await getFileForRegistration(drive, fileId);
    if (!file) throw new HttpsError('not-found', 'Could not access that Drive file.');
    const folder = await resolveArtistFolder(
      drive,
      file.parents[0] ?? null,
      rootFolderId,
      MAX_FOLDER_DEPTH,
    );
    if (!folder.underRoot) {
      throw new HttpsError('permission-denied', 'That file is not in the document library folder.');
    }

    const artist = folder.artistName;
    await db.doc(`artistDocuments/${file.id}`).set({
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      iconLink: file.iconLink,
      webViewLink: file.webViewLink,
      artist,
      artistKey: artist ? artistKey(artist) : null,
      categoryId: null,
      sourceFolderId: folder.artistFolderId,
      importedBy: uid,
      importedByEmail: token.email ?? null,
      importedAt: Timestamp.now(),
    });
    return { ok: true };
  },
);

/**
 * Include a canonical library document on an advance (admin or event PM). Resolves the
 * `artistDocuments` record server-side and copies its trusted display metadata — clients
 * no longer assert the file id or its metadata (F-1 hardening). The advance-document id is
 * the library id (= the Drive file id). Input: { eventId, stageId, advanceId, artistDocumentId }.
 */
export const includeArtistDocumentOnAdvance = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, artistDocumentId } = parseCallableData(
    includeAdvanceDocumentInputSchema,
    request.data,
  );
  const db = getFirestore();
  await enforceRateLimit(db, ['includeArtistDocumentOnAdvance', uid], 60);
  await assertCanEditEvent(db, token, uid, eventId);

  const advanceRef = db.doc(advancePath(eventId, stageId, advanceId));
  if (!(await advanceRef.get()).exists) throw new HttpsError('not-found', 'Advance not found.');

  const lib = (await db.doc(`artistDocuments/${artistDocumentId}`).get()).data();
  if (!lib) throw new HttpsError('not-found', 'Unknown library document.');
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const name = str(lib.name);
  const webViewLink = str(lib.webViewLink);
  if (!name || !webViewLink)
    throw new HttpsError('internal', 'Library document is missing required fields.');

  await advanceRef
    .collection('documents')
    .doc(artistDocumentId)
    .set({
      fileId: artistDocumentId,
      name,
      displayName: str(lib.displayName),
      mimeType: str(lib.mimeType) ?? 'application/octet-stream',
      iconLink: str(lib.iconLink),
      webViewLink,
      categoryId: str(lib.categoryId),
      includePacket: false,
      addedBy: uid,
      addedAt: Timestamp.now(),
    });
  return { ok: true };
});
