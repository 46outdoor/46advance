/**
 * Phase 13 — Google Drive (per-user OAuth, reuses 11b). Least-privilege `drive.file`:
 * the app only touches files the user picks via the Google Picker (the pick grants our
 * OAuth client per-file access) or files the app creates. Every callable runs as the
 * signed-in user (their stored refresh token), gated to event members / PMs.
 *
 *   - getDriveAccessToken : mint a short-lived access token for the client-side Picker.
 *   - linkDriveFile       : validate access + capture canonical metadata, append to the advance.
 *   - removeDriveFile     : drop a linked file from the advance (does NOT delete it from Drive).
 *   - savePacketToDrive   : copy a generated packet (Storage) into the caller's Drive.
 *
 * `driveFiles` on the advance is written ONLY here (Admin SDK) — firestore.rules rejects
 * client writes — so a stored link is always a real, server-validated `drive.google.com`
 * URL (no spoofing).
 */
import { Readable } from 'node:stream';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { google, type drive_v3 } from 'googleapis';
import { OAUTH_SECRETS, type AuthClient, authedClientForUser, assertCanEditEvent } from './google.js';

const STORAGE_BUCKET = 'advancethat.firebasestorage.app';
const APP_FOLDER = '46 Advance';
const FILE_FIELDS = 'id,name,mimeType,webViewLink,iconLink';

function advancePath(eventId: string, stageId: string, advanceId: string): string {
  return `events/${eventId}/stages/${stageId}/advances/${advanceId}`;
}

/** Read-level gate (member or admin), mirroring firestore.rules `isMember`. */
async function assertEventMember(db: Firestore, uid: string, isAdmin: boolean, eventId: string): Promise<void> {
  if (isAdmin) return;
  const member = await db.doc(`events/${eventId}/members/${uid}`).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Not a member of this event.');
}

/** Existing driveFiles array on an advance snapshot (or []). */
function existingFiles(data: DocumentData | undefined): Array<Record<string, unknown>> {
  const v = data?.driveFiles;
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

/**
 * Short-lived OAuth access token for the browser Picker. Refresh tokens stay server-side;
 * only this transient, `drive.file`-scoped access token is handed to the client.
 */
export const getDriveAccessToken = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const db = getFirestore();
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
  const { eventId, stageId, advanceId, fileId } = request.data ?? {};
  if (
    typeof eventId !== 'string' || !eventId ||
    typeof stageId !== 'string' || !stageId ||
    typeof advanceId !== 'string' || !advanceId ||
    typeof fileId !== 'string' || !fileId
  ) {
    throw new HttpsError('invalid-argument', 'Expected { eventId, stageId, advanceId, fileId }.');
  }
  const db = getFirestore();
  await assertCanEditEvent(db, uid, token.admin === true, eventId);

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
    linkedAt: Timestamp.now(), // serverTimestamp() is not allowed inside an array element
  };
  const next = existingFiles(snap.data()).filter((e) => e.fileId !== file.id);
  next.push(entry);
  await ref.set({ driveFiles: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

/**
 * Unlink a Drive file from an advance (admin or event PM). Removes the reference only —
 * the file itself stays in the owner's Drive. Input: { eventId, stageId, advanceId, fileId }.
 */
export const removeDriveFile = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, fileId } = request.data ?? {};
  if (
    typeof eventId !== 'string' || !eventId ||
    typeof stageId !== 'string' || !stageId ||
    typeof advanceId !== 'string' || !advanceId ||
    typeof fileId !== 'string' || !fileId
  ) {
    throw new HttpsError('invalid-argument', 'Expected { eventId, stageId, advanceId, fileId }.');
  }
  const db = getFirestore();
  await assertCanEditEvent(db, uid, token.admin === true, eventId);

  const ref = db.doc(advancePath(eventId, stageId, advanceId));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Advance not found.');
  const next = existingFiles(snap.data()).filter((e) => e.fileId !== fileId);
  await ref.set({ driveFiles: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

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
    const { eventId, path } = request.data ?? {};
    if (typeof eventId !== 'string' || !eventId || typeof path !== 'string' || !path) {
      throw new HttpsError('invalid-argument', 'Expected { eventId, path }.');
    }
    // Confine to this event's packets — no traversal to other events or objects.
    if (!path.startsWith(`events/${eventId}/packets/`) || path.includes('..')) {
      throw new HttpsError('invalid-argument', 'Invalid packet path.');
    }
    const db = getFirestore();
    await assertEventMember(db, uid, token.admin === true, eventId);

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
