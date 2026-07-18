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
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { google, type drive_v3 } from 'googleapis';
import { OAUTH_SECRETS, TIME_ZONE, type AuthClient, authedClientForUser, assertCanEditEvent } from './google.js';
import { assertApproved } from './lib/auth/authorize.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  getArtistDocumentContentInputSchema,
  importDriveFolderInputSchema,
  linkDriveFileInputSchema,
  removeDriveFileInputSchema,
  savePacketToDriveInputSchema,
} from './contracts/callables/googleDrive.js';

const STORAGE_BUCKET = 'advancethat.firebasestorage.app';
const APP_FOLDER = '46 Advance';
const FILE_FIELDS = 'id,name,mimeType,webViewLink,iconLink';

function advancePath(eventId: string, stageId: string, advanceId: string): string {
  return `events/${eventId}/stages/${stageId}/advances/${advanceId}`;
}

/** Read-level gate (member or admin), mirroring firestore.rules `isMember` — including the
 *  `approved` account requirement, since the Admin SDK bypasses rules. */
async function assertEventMember(db: Firestore, token: DecodedIdToken, uid: string, eventId: string): Promise<void> {
  assertApproved(token);
  if (token.admin === true) return;
  const member = await db.doc(`events/${eventId}/members/${uid}`).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Not a member of this event.');
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
 * NOTE (P2-15, deferred): this token carries ALL scopes the user granted at connect (calendar +
 * drive.file + drive.metadata.readonly), not `drive.file` alone — a user OAuth access token can't
 * be scope-narrowed from its refresh token. True Picker down-scoping needs a SEPARATE
 * drive.file-only OAuth grant (a second consent + refresh token), which would force every user to
 * re-consent; tracked as a product decision rather than done here.
 */
export const getDriveAccessToken = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  assertApproved(request.auth.token);
  const db = getFirestore();
  await enforceRateLimit(db, ['getDriveAccessToken', request.auth.uid], 30);
  const client = await authedClientForUser(db, request.auth.uid); // throws failed-precondition if not connected
  const { token } = await client.getAccessToken();
  if (!token) throw new HttpsError('failed-precondition', 'Could not obtain a Drive access token.');
  return { accessToken: token };
});

/**
 * Link a Picker-selected Drive file to an advance (admin or event PM). Validates access via
 * `drive.files.get` and stores Google's canonical metadata — clients never write the link.
 * Input: { eventId, stageId, advanceId, fileId }.
 */
export const linkDriveFile = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, fileId } = parseCallableData(linkDriveFileInputSchema, request.data);
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
    throw new HttpsError('not-found', 'Could not access that Drive file — re-pick it from the Drive picker.');
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
});

/**
 * Unlink a Drive file from an advance (admin or event PM). Removes the reference only —
 * the file itself stays in the owner's Drive. Input: { eventId, stageId, advanceId, fileId }.
 */
export const removeDriveFile = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, fileId } = parseCallableData(removeDriveFileInputSchema, request.data);
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
async function listChildren(drive: drive_v3.Drive, parentId: string, foldersOnly: boolean): Promise<drive_v3.Schema$File[]> {
  const folderType = "mimeType = 'application/vnd.google-apps.folder'";
  const typeClause = foldersOnly ? folderType : `not ${folderType}`;
  const q = `'${parentId}' in parents and ${typeClause} and trashed = false`;
  const out: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id,name,mimeType,iconLink,webViewLink)',
      spaces: 'drive',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
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
async function collectAllFiles(drive: drive_v3.Drive, folderId: string, depth: number): Promise<drive_v3.Schema$File[]> {
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
 */
export const importDriveFolder = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  assertApproved(token);
  if (token.admin !== true && token.organizer !== true) {
    throw new HttpsError('permission-denied', 'Admin or organizer only.');
  }
  const { folderId } = parseCallableData(importDriveFolderInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['importDriveFolder', uid], 10);

  const client = await authedClientForUser(db, uid);
  const drive = google.drive({ version: 'v3', auth: client });

  let subfolders: drive_v3.Schema$File[];
  try {
    subfolders = await listChildren(drive, folderId, true);
  } catch {
    throw new HttpsError('not-found', 'Could not read that folder — re-pick it from the Drive picker.');
  }
  const groups = await enumerateLibrary(drive, folderId, subfolders);

  // The library root — recorded so uploads can create subfolders for new artists and
  // the scheduled sync knows what to sweep.
  await db.doc('config/documentsLibrary').set(
    { rootFolderId: folderId, updatedAt: Timestamp.now() },
    { merge: true },
  );

  const counts = await upsertLibrary(db, groups, { uid, email: token.email ?? null });
  return { imported: counts.imported, skipped: counts.skipped };
});

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
): Promise<LibraryGroup[]> {
  const folders = subfolders ?? (await listChildren(drive, rootFolderId, true));
  const rootFiles = await listChildren(drive, rootFolderId, false);
  return [
    { artist: null, folderId: rootFolderId, files: rootFiles },
    ...(await Promise.all(
      folders
        .filter((f) => f.id)
        .map(async (f) => ({
          artist: f.name ?? 'Unknown',
          folderId: f.id as string,
          files: await collectAllFiles(drive, f.id as string, 0),
        })),
    )),
  ];
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
  for (const [id, data] of existingDocs) {
    if (seen.has(id) || data.missingFromDrive === true) continue;
    batch.set(db.collection('artistDocuments').doc(id), { missingFromDrive: true }, { merge: true });
    flagged += 1;
    await bump();
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
    const drive = brokerDriveClient();
    const groups = await enumerateLibrary(drive, root);
    const counts = await upsertLibrary(db, groups, { uid: 'drive-sync', email: null });
    logger.info('Library Drive sync complete', counts);
  },
);

/** Find-or-create an app-owned Drive folder. `drive.file` lists only files the app created,
 *  so this reliably reuses our own folder rather than colliding with the user's. */
async function ensureFolder(drive: drive_v3.Drive, name: string, parentId: string | null): Promise<string> {
  const safe = name.replace(/['\\]/g, '\\$&');
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const list = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${safe}' and trashed = false${parentClause}`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  });
  const found = list.data.files?.[0]?.id;
  if (found) return found;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  if (!created.data.id) throw new HttpsError('internal', 'Could not create the Drive folder.');
  return created.data.id;
}

function packetStamp(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date()); // YYYY-MM-DD
}

/**
 * Copy an already-generated packet (Storage) into the caller's Drive under
 * `46 Advance / {event name}`. Member-gated (anyone who can view the event may save their own
 * copy). Graceful `{ saved: false, reason: 'not_connected' }` when Google isn't connected.
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
    await assertEventMember(db, token, uid, eventId);

    const eventSnap = await db.doc(`events/${eventId}`).get();
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
    const eventName = String(eventSnap.data()?.name ?? 'Event');

    const fileRef = getStorage().bucket(STORAGE_BUCKET).file(path);
    const [exists] = await fileRef.exists();
    if (!exists) throw new HttpsError('not-found', 'Packet file not found — generate it first.');

    let client: AuthClient;
    try {
      client = await authedClientForUser(db, uid);
    } catch {
      return { saved: false, reason: 'not_connected' };
    }
    const [buffer] = await fileRef.download();
    const drive = google.drive({ version: 'v3', auth: client });
    const root = await ensureFolder(drive, APP_FOLDER, null);
    const eventFolder = await ensureFolder(drive, eventName, root);

    const created = await drive.files.create({
      requestBody: { name: `${eventName} — packet — ${packetStamp()}.pdf`, parents: [eventFolder] },
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id,webViewLink',
    });
    return { saved: true, webViewLink: created.data.webViewLink ?? null, fileId: created.data.id ?? null };
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
    assertApproved(token);
    const { fileId, eventId } = parseCallableData(getArtistDocumentContentInputSchema, request.data);
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
    const result = await fetchBrokeredFileBytes(drive, fileId, storedMime);
    if ('tooLarge' in result) throw new HttpsError('internal', 'Unexpected size gate.'); // no cap on this path
    return {
      base64: result.data.toString('base64'),
      mimeType: result.mimeType,
      name: typeof doc.name === 'string' ? doc.name : 'document',
    };
  },
);

/** Workspace types `files.export` can actually convert to PDF — `vnd.google-apps.*`
 * also covers folders and shortcuts, which would 400 on export. */
const EXPORTABLE_GOOGLE_MIMES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

/** Fetch a file's bytes via a broker Drive client. Google-native docs (Docs/Sheets/
 * Slides — common for riders) can't be downloaded raw (`files.get?alt=media` 403s);
 * exportable ones convert to PDF, which is universally viewable and packet-embeddable.
 * With `maxBytes`, binary files preflight their metadata size and return
 * `{ tooLarge: true }` instead of buffering an oversized download (native exports have
 * no size until exported — the caller's post-hoc length check covers those). */
export async function fetchBrokeredFileBytes(
  drive: drive_v3.Drive,
  fileId: string,
  storedMime: string,
  maxBytes?: number,
): Promise<{ data: Buffer; mimeType: string } | { tooLarge: true }> {
  if (storedMime.startsWith('application/vnd.google-apps.')) {
    if (!EXPORTABLE_GOOGLE_MIMES.has(storedMime)) {
      throw new HttpsError('failed-precondition', 'This Google Drive item type cannot be exported.');
    }
    const res = await drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
    return { data: Buffer.from(res.data as ArrayBuffer), mimeType: 'application/pdf' };
  }
  if (maxBytes !== undefined) {
    const meta = await drive.files.get({ fileId, fields: 'size', supportsAllDrives: true });
    const size = Number(meta.data.size ?? 0);
    if (size > maxBytes) return { tooLarge: true };
  }
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return { data: Buffer.from(res.data as ArrayBuffer), mimeType: storedMime || 'application/octet-stream' };
}
