import { initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { seedScheduleFromTemplates } from './scheduleTemplateSeed';
import { renderPacket, type PacketData, type PacketLogo } from './lib/pdf/packet.js';
import { appendPacketAttachments, type PacketAttachment } from './lib/pdf/attachments.js';
import { DRIVE_SA_KEY, brokerDriveClient } from './googleDrive.js';
import { fetchBrokeredFileBytes, MAX_EMBED_BYTES } from './lib/broker/brokerFetch.js';
import { renderQuote, fmtMoney, type QuotePdfData } from './lib/pdf/quote.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseAdminEmails, isAdminEmail } from './lib/auth/adminAllowlist.js';
import { assertActiveUser, assertAdmin } from './lib/auth/authorize.js';
import { ChunkedBatch, type BatchLike } from './lib/db/chunkedBatch.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  deleteUserInputSchema,
  setUserApprovedInputSchema,
  setUserDisplayNameInputSchema,
  setUserOrganizerInputSchema,
  syncUserClaimsInputSchema,
} from './contracts/callables/auth.js';
import { resolveDisplayName } from './lib/auth/displayName.js';
import { createBlankEventInputSchema, createEventFromTemplateInputSchema } from './contracts/callables/events.js';
import { reserveEventSlug } from './lib/events/slug.js';
import { generatePacketInputSchema, generateQuotePdfInputSchema } from './contracts/callables/pdf.js';
import { OAUTH_SECRETS, disconnectGoogle } from './google.js';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Phase 11b — Google Calendar + Meet (per-user OAuth). Defined in ./google.ts.
export {
  googleAuthUrl,
  googleAuthCallback,
  googleDisconnect,
  createEventCalendar,
  createAdvanceCall,
} from './google.js';

// Phase 11b (sync) — match Appointment Schedule bookings to advances. ./googleBookings.ts.
export { syncAdvanceCallBookings, scheduledAdvanceCallSync } from './googleBookings.js';

// Schedule → Google calendar sync (redesign PR 4). ./googleSchedule.ts.
export { reconcileScheduleDay, removeScheduleCalendarEvent } from './googleSchedule.js';

// Phase 13 — Google Drive (per-user OAuth): link files to advances + save packets. ./googleDrive.ts.
export { getDriveAccessToken, linkDriveFile, removeDriveFile, savePacketToDrive, importDriveFolder, getArtistDocumentContent, scheduledLibraryDriveSync, registerEventDocument, registerArtistDocument, includeArtistDocumentOnAdvance, validateLibraryFolder } from './googleDrive.js';
export { deleteAdvance, deleteStage, deleteQuote } from './eventCleanup.js';

// Transactional slug rename (WS-G): moves an event's `slugs/{slug}` reservation atomically.
export { renameEventSlug } from './eventSlug.js';

// Atomic manual booking attach (WS-G). ./googleBookings.ts.
export { attachCallBooking } from './googleBookings.js';

// Daily data-retention sweep (WS-H): prune abandoned OAuth states, expired rate limits, stale bookings.
export { scheduledDataRetention } from './retention.js';

// Email a fixed admin address when a new account registers + needs approval (needs SMTP_PASSWORD secret).
export { notifyOnRegistration } from './registrationNotify.js';

// Re-name an event's Google calendar when its short code / name changes (post-creation).
export { renameEventCalendarOnChange } from './eventCalendarRename.js';

const STORAGE_BUCKET = 'advancethat.firebasestorage.app';
const PACKET_DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// Event dates (date-only) render in the EVENT's timezone so the PDF shows the intended calendar
// day regardless of the Cloud Functions server zone (F-6).
const packetDateFmt = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
const fmtDate = (v: unknown, timeZone: string): string | null =>
  v instanceof Timestamp ? packetDateFmt(timeZone).format(v.toDate()) : null;
const fmtRange = (a: unknown, b: unknown, timeZone: string): string | null => {
  const x = fmtDate(a, timeZone);
  const y = fmtDate(b, timeZone);
  if (x && y) return `${x} – ${y}`;
  return x ?? y ?? null;
};

/**
 * Emails granted the global admin role. Sourced from the `ADMIN_EMAILS` env var
 * (comma-separated) so the owner can be rotated without a code change; defaults to
 * the app-admin identity. Distinct from the GCP project owner (see AGENTS.md).
 */
const ADMIN_EMAILS = parseAdminEmails(process.env.ADMIN_EMAILS);

/**
 * Link a signing-in account to the global contacts directory. Prefers a pre-added,
 * still-unlinked contact matched by email (admins can add people ahead of time — the
 * account links to that contact and inherits its name); otherwise creates the mirror
 * contacts/{uid}. Returns the linked contact id + its name (for display-name backfill).
 */
async function linkOrCreateContact(
  db: Firestore,
  uid: string,
  email: string | null,
  fallbackName: string | null,
): Promise<{ contactId: string; contactName: string | null }> {
  const nameOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

  // Legacy mirror already present (accounts created before contactId tracking).
  const mirrorRef = db.collection('contacts').doc(uid);
  const mirror = await mirrorRef.get();
  if (mirror.exists) return { contactId: uid, contactName: nameOrNull(mirror.data()?.name) };

  // Pre-added, unlinked contact with this email → link it (no duplicate created).
  if (email) {
    const matches = await db.collection('contacts').where('email', '==', email).limit(10).get();
    const match = matches.docs.find((d) => {
      const linkedTo = d.data().userId;
      return !linkedTo || linkedTo === uid;
    });
    if (match) {
      await match.ref.set({ userId: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { contactId: match.id, contactName: nameOrNull(match.data().name) };
    }
  }

  // No existing contact → create the mirror contacts/{uid}.
  const now = FieldValue.serverTimestamp();
  await mirrorRef.set({
    name: fallbackName ?? email ?? 'Team member',
    email,
    role: null,
    company: null,
    phone: null,
    notes: null,
    userId: uid,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  return { contactId: uid, contactName: fallbackName };
}

/**
 * True when `email` matches an existing contact that an ADMIN or ORGANIZER added — the signal that a
 * registering user is a vetted, known person who may skip manual approval (owner request). Only
 * admin/organizer-created contacts count, so a regular member can't pre-approve an outsider by adding
 * a contact. Callers MUST also require a verified email before trusting this (a match to an address
 * you don't control must never grant access). The creator's role is read from their `users/{uid}`
 * record (isAdmin/organizer), which `syncUserClaims` keeps in sync with the claims.
 */
async function approvedByAdminContact(db: Firestore, email: string): Promise<boolean> {
  const matches = await db.collection('contacts').where('email', '==', email).limit(10).get();
  for (const doc of matches.docs) {
    const createdBy = doc.data().createdBy;
    if (typeof createdBy !== 'string' || !createdBy) continue;
    const creator = (await db.collection('users').doc(createdBy).get()).data();
    if (creator?.isAdmin === true || creator?.organizer === true) return true;
  }
  return false;
}

/**
 * Called by the client after sign-in. Upserts the caller's `users/{uid}` profile,
 * sets/clears the global `admin` claim from the allowlist, and surfaces the global
 * `organizer` claim (set by an admin via setUserOrganizer). Returns
 * `{ isAdmin, isOrganizer }`. Idempotent; works for existing and new accounts.
 */
export const syncUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const email = token.email ?? null;
  // Email verification is set automatically for federated (Google) sign-in; email/password
  // accounts must click the verification link first.
  const emailVerified = token.email_verified === true;

  // The name entered at registration (the client also sets it on the Auth profile). Used as the
  // profile-name hint below without clobbering an admin-set name; falls back to the token name.
  const input = parseCallableData(syncUserClaimsInputSchema, request.data ?? {});
  const nameHint = trimmedOrNull(input.displayName) ?? token.name ?? null;

  // Rate-limit BEFORE any external call (the Auth getUser below) so abuse is capped up front.
  const db = getFirestore();
  await enforceRateLimit(db, ['syncUserClaims', uid], 60);

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  const isOrganizer = existing.organizer === true;
  const wasAdmin = existing.admin === true;
  const wasApproved = existing.approved === true;

  // Email verification gates *new* privilege GRANTS — an attacker who self-registers the
  // allowlisted admin address can't be granted `admin` until they verify. It does NOT revoke
  // an already-trusted account for lack of verification: downgrading a prior admin/approved
  // would lock out an existing owner before the "verify your email" UI is live. So a matching
  // allowlist email becomes admin only when verified OR already admin.
  const isAdmin = isAdminEmail(email, ADMIN_EMAILS) && (emailVerified || wasAdmin);

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  // A verified email matching a contact an ADMIN/ORGANIZER pre-added marks a vetted, known person who
  // may skip manual approval (owner request). Verification is required so the match can't be spoofed;
  // only checked for a not-yet-approved account (skips the lookup on normal approved sign-ins).
  const contactApproved =
    !isAdmin && !wasApproved && emailVerified && Boolean(email)
      ? await approvedByAdminContact(db, email as string)
      : false;

  // Admins are always approved; an already-approved account is never revoked here; a verified
  // pre-existing account is grandfathered; a verified match to an admin-added contact auto-approves;
  // otherwise a new/unverified account stays PENDING.
  const approved = isAdmin
    ? true
    : wasApproved
      ? true
      : emailVerified && snap.exists && existing.approved !== false
        ? true
        : contactApproved;

  if (existing.admin !== isAdmin || existing.approved !== approved) {
    await adminAuth.setCustomUserClaims(uid, { ...existing, admin: isAdmin, approved });
  }

  // Reconcile the account with the global contacts directory (once, tracked via
  // users/{uid}.contactId): prefer linking a pre-added contact matched by email so admins
  // can add people ahead of time; otherwise create the mirror contacts/{uid}.
  const userData = snap.data();
  let contactId: string | null = typeof userData?.contactId === 'string' ? userData.contactId : null;
  let contactName: string | null = null;
  if (!contactId) {
    const linked = await linkOrCreateContact(db, uid, email, nameHint);
    contactId = linked.contactId;
    contactName = linked.contactName;
  }

  await ref.set(
    {
      email,
      // Never clobber an existing/admin-set name; else the registration/token name; else the contact's.
      displayName: resolveDisplayName(userData?.displayName, nameHint, contactName),
      contactId,
      isAdmin,
      organizer: isOrganizer,
      approved,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return { isAdmin, isOrganizer, approved, emailVerified };
});

/**
 * Admin-only. Approves/revokes a user's access to the app. Sets the `approved` custom claim
 * and mirrors `users/{uid}.approved`. On REVOCATION (approved=false) it also revokes the
 * user's refresh tokens and disconnects their Google integration, so revocation is
 * authoritative and doesn't leak through background jobs. Input: { uid, approved }.
 *
 * Propagation bound: revoking refresh tokens stops NEW ID tokens immediately, but an ID
 * token already in the user's hands still satisfies the claim-based Firestore/Storage rules
 * until it expires (~1 hour) — the documented direct-SDK propagation window. Callables use
 * the token as a fast gate; scheduled jobs re-check the authoritative `users/{uid}.approved`
 * record, so they ignore a revoked user immediately.
 */
export const setUserApproved = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  assertAdmin(request.auth);
  const { uid, approved } = parseCallableData(setUserApprovedInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['setUserApproved', request.auth.uid], 30);

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, approved });
  await db.collection('users').doc(uid).set({ approved }, { merge: true });

  if (!approved) {
    await adminAuth.revokeRefreshTokens(uid);
    await disconnectGoogle(db, uid);
  }
  return { uid, approved };
});

/**
 * Admin-only. Grants/revokes the global `organizer` capability (lets a user create
 * events). Sets the custom claim and mirrors `users/{uid}.organizer`. The target
 * user picks up the claim on their next token refresh / sign-in.
 */
export const setUserOrganizer = onCall(async (request) => {
  assertAdmin(request.auth);
  const { uid, organizer } = parseCallableData(setUserOrganizerInputSchema, request.data);
  await enforceRateLimit(getFirestore(), ['setUserOrganizer', request.auth.uid], 30);

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, organizer });
  await getFirestore().collection('users').doc(uid).set({ organizer }, { merge: true });

  return { uid, organizer };
});

/**
 * Admin-only. Sets a user's display name (shown in member pickers/lists). An empty string
 * clears it (display falls back to email). Keeps the user's linked contact name in sync.
 */
export const setUserDisplayName = onCall(async (request) => {
  assertAdmin(request.auth);
  const { uid, displayName } = parseCallableData(setUserDisplayNameInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['setUserDisplayName', request.auth.uid], 30);

  const name = displayName.trim() || null;
  await db.collection('users').doc(uid).set({ displayName: name }, { merge: true });
  // Keep this user's linked/mirrored contact name consistent.
  if (name) {
    const linked = await db.collection('contacts').where('userId', '==', uid).limit(1).get();
    if (!linked.empty) {
      await linked.docs[0].ref.set({ name, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return { uid, displayName: name };
});

/** True only for the Admin SDK "user already gone" error — the one Auth-deletion failure
 * deleteUser tolerates (so retries are idempotent). Every other error must surface. */
function isAuthUserNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'auth/user-not-found'
  );
}

/**
 * Admin-only. Permanently deletes an account: the Firebase Auth user + `users/{uid}`,
 * clears event memberships, drops the Google integration, and unlinks (keeps) their contact
 * as reference data. Cannot delete your own account.
 *
 * Durable + idempotent (F-9): access is revoked/disconnected first so a partial failure can't
 * leave a usable session; the Auth account is then deleted, tolerating ONLY "already gone" —
 * any other Auth error surfaces so the call never reports success while a live account
 * remains; application data is cleaned last with idempotent ops, so re-running the call after
 * any partial failure completes safely.
 */
export const deleteUser = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  assertAdmin(request.auth);
  const { uid } = parseCallableData(deleteUserInputSchema, request.data);
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
  }
  const db = getFirestore();
  await enforceRateLimit(db, ['deleteUser', request.auth.uid], 30);
  const adminAuth = getAuth();

  // Revoke access + drop the Google integration BEFORE deleting anything else.
  await adminAuth.revokeRefreshTokens(uid).catch(() => undefined);
  await disconnectGoogle(db, uid);

  // Delete the Auth account; tolerate only "already deleted". Any other error means the
  // account may still be live — fail loudly instead of reporting success.
  try {
    await adminAuth.deleteUser(uid);
  } catch (err) {
    if (!isAuthUserNotFound(err)) {
      logger.error('deleteUser: Auth account deletion failed', { uid, err: String(err) });
      throw new HttpsError('internal', 'Could not delete the Auth account — retry.');
    }
  }

  // Clear event memberships (members docs mirror the uid field) + unlink their contact(s), and
  // forget any event calendars this now-gone user created in their personal Google account — the
  // token is revoked, so the app can never write to them again. Clearing the reference lets a later
  // reconcile recreate a calendar under a still-connected PM (WS-H).
  const memberships = await db.collectionGroup('members').where('uid', '==', uid).get();
  const contacts = await db.collection('contacts').where('userId', '==', uid).get();
  const ownedCalendars = await db.collection('events').where('googleCalendarOwnerUid', '==', uid).get();

  const batch = new ChunkedBatch(db);
  memberships.forEach((m) => batch.delete(m.ref));
  contacts.forEach((c) =>
    batch.set(c.ref, { userId: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  );
  ownedCalendars.forEach((e) =>
    batch.set(
      e.ref,
      {
        googleCalendarId: FieldValue.delete(),
        googleCalendarOwnerUid: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  );
  batch.delete(db.collection('users').doc(uid));
  await batch.commit();

  return { uid, deleted: true };
});

/** Coerce a candidate epoch-millis value into a Firestore Timestamp (or null). */
const toTimestamp = (v: unknown): Timestamp | null => (typeof v === 'number' ? Timestamp.fromMillis(v) : null);

/** Coerce a candidate to a non-empty trimmed string, else null. */
const trimmedOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Read an array-typed field, defaulting to an empty array when absent/mismatched. */
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

interface NewEventInput {
  templateId: string;
  name: string;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  loadInDays: number;
  loadOutDays: number;
  timeZone: string;
  venue: string | null;
  shortCode: string | null;
  slug: string | null;
}

/** Parse + validate the createEventFromTemplate payload. Throws on invalid input. */
function parseNewEventInput(data: unknown): NewEventInput {
  const input = parseCallableData(createEventFromTemplateInputSchema, data);
  return {
    templateId: input.templateId,
    name: input.name, // schema trims + requires non-empty
    startDate: toTimestamp(input.startDate),
    endDate: toTimestamp(input.endDate),
    loadInDays: input.loadInDays ?? 0,
    loadOutDays: input.loadOutDays ?? 0,
    timeZone: input.timeZone ?? 'America/Chicago',
    venue: trimmedOrNull(input.venue),
    shortCode: trimmedOrNull(input.shortCode),
    slug: trimmedOrNull(input.slug),
  };
}

/** Seed the caller as PM, then template members (without clobbering the caller). */
function seedEventMembers(batch: BatchLike, eventRef: DocumentReference, tpl: DocumentData, uid: string, now: FieldValue): void {
  batch.set(eventRef.collection('members').doc(uid), { role: 'production-manager', addedBy: uid, addedAt: now, uid });
  for (const m of asArray(tpl.members)) {
    const member = m as DocumentData;
    if (member && typeof member.uid === 'string' && member.uid !== uid && typeof member.role === 'string') {
      batch.set(eventRef.collection('members').doc(member.uid), {
        role: member.role,
        addedBy: uid,
        addedAt: now,
        uid: member.uid,
      });
    }
  }
}

/** Seed the event-level production record from the template blueprint. */
function seedEventProduction(batch: BatchLike, eventRef: DocumentReference, tpl: DocumentData, now: FieldValue): void {
  const ep = (tpl.eventProduction ?? {}) as DocumentData;
  batch.set(eventRef.collection('production').doc('record'), {
    info: ep.info ?? {},
    contacts: asArray(ep.contacts),
    links: asArray(ep.links),
    updatedAt: now,
  });
}

/** Seed stages + per-stage production records; returns a map of lowercased stage name → new id. */
function seedEventStages(
  batch: BatchLike,
  eventRef: DocumentReference,
  tpl: DocumentData,
  now: FieldValue,
): Map<string, string> {
  const stageProduction = (tpl.stageProduction ?? {}) as DocumentData;
  const stageIdByName = new Map<string, string>();
  for (const s of asArray(tpl.stages)) {
    const stage = s as DocumentData;
    if (!stage || typeof stage.name !== 'string') continue;
    const stageRef = eventRef.collection('stages').doc();
    batch.set(stageRef, {
      name: stage.name,
      order: typeof stage.order === 'number' ? stage.order : 0,
      createdAt: now,
      updatedAt: now,
    });
    stageIdByName.set(stage.name.trim().toLowerCase(), stageRef.id);
    const content = (stageProduction[stage.id] as DocumentData | undefined)?.content;
    if (content && typeof content === 'object') {
      batch.set(stageRef.collection('production').doc('record'), { content, updatedAt: now });
    }
  }
  return stageIdByName;
}

/**
 * Create a new event from a template (admin|organizer). Clones the full blueprint —
 * enabled departments + stages + event production record + per-stage production
 * (house package) + default roles — and adds the caller as production-manager. Artist
 * Advances are NOT seeded. Runs with the Admin SDK so an organizer can seed members.
 * Input: { templateId, name, startDate?: number|null, endDate?: number|null, venue?: string|null }
 * (dates are epoch millis). Returns { eventId }.
 */
export const createEventFromTemplate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  await assertActiveUser({ uid, token }); // an organizer whose access was revoked can't create events
  if (token.admin !== true && token.organizer !== true) {
    throw new HttpsError('permission-denied', 'Admin or organizer only.');
  }

  const input = parseNewEventInput(request.data ?? {});

  const db = getFirestore();
  await enforceRateLimit(db, ['createEventFromTemplate', uid], 20);
  const tplSnap = await db.collection('templates').doc(input.templateId).get();
  if (!tplSnap.exists) {
    throw new HttpsError('not-found', 'Template not found.');
  }
  const tpl = tplSnap.data() ?? {};
  const now = FieldValue.serverTimestamp();
  const batch = new ChunkedBatch(db);

  const eventRef = db.collection('events').doc();
  // Readable URL slug — transactionally reserved against `slugs/{slug}` (WS-G), replacing the
  // old non-transactional scan of the events collection. Reserving before the seed batch means
  // a rare batch failure leaves only an unused reservation (self-healing — keyed by this event
  // id, so a retry reuses it), never a duplicate slug.
  const slug = await reserveEventSlug(db, input.slug || input.name, eventRef.id);

  batch.set(eventRef, {
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    loadInDays: input.loadInDays,
    loadOutDays: input.loadOutDays,
    timeZone: input.timeZone,
    venue: input.venue,
    shortCode: input.shortCode,
    status: 'draft',
    departmentIds: asArray(tpl.departmentIds),
    slug,
    eventLogo: tpl.eventLogo ?? null,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });

  seedEventMembers(batch, eventRef, tpl, uid, now);
  seedEventProduction(batch, eventRef, tpl, now);
  const stageIdByName = seedEventStages(batch, eventRef, tpl, now);

  const scheduleTemplateIds = asArray(tpl.scheduleTemplateIds).filter(
    (x): x is string => typeof x === 'string',
  );
  if (scheduleTemplateIds.length > 0 && input.startDate) {
    await seedScheduleFromTemplates(
      db,
      batch,
      eventRef,
      scheduleTemplateIds,
      input.startDate.toDate(),
      input.timeZone,
      stageIdByName,
      uid,
      now,
    );
  }

  await batch.commit();
  return { eventId: eventRef.id };
});

/**
 * Create a blank event + the creator's production-manager membership atomically
 * (admin|organizer). The client supplies the event id, which doubles as an idempotency
 * key: retrying a timed-out request returns the same event instead of creating a
 * duplicate, and the event can never be committed without its creator membership (both
 * writes ride one transaction). Dates are epoch millis. Returns { eventId }.
 */
export const createBlankEvent = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  await assertActiveUser({ uid, token }); // an organizer whose access was revoked can't create events
  if (token.admin !== true && token.organizer !== true) {
    throw new HttpsError('permission-denied', 'Admin or organizer only.');
  }
  const input = parseCallableData(createBlankEventInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['createBlankEvent', uid], 20);

  const eventRef = db.collection('events').doc(input.eventId);
  const existing = await eventRef.get();
  if (existing.exists) {
    // Idempotent retry by the same creator → return it; a different owner's id → conflict.
    if (existing.get('createdBy') === uid) return { eventId: input.eventId };
    throw new HttpsError('already-exists', 'That event id is already in use.');
  }

  // Transactionally reserved unique slug (WS-G) — keyed by this event id, so an idempotent
  // create retry (same eventId) reuses its reservation instead of allocating a new one.
  const slug = await reserveEventSlug(db, input.slug || input.name, eventRef.id);
  const now = FieldValue.serverTimestamp();

  await db.runTransaction(async (tx) => {
    if ((await tx.get(eventRef)).exists) return; // lost a concurrent race — idempotent no-op
    tx.set(eventRef, {
      name: input.name,
      startDate: toTimestamp(input.startDate),
      endDate: toTimestamp(input.endDate),
      loadInDays: input.loadInDays ?? 0,
      loadOutDays: input.loadOutDays ?? 0,
      timeZone: input.timeZone ?? 'America/Chicago',
      venue: trimmedOrNull(input.venue),
      shortCode: trimmedOrNull(input.shortCode),
      driveFolderId: input.driveFolderId ?? null,
      driveFolderName: input.driveFolderName ?? null,
      status: input.status ?? 'draft',
      departmentIds: input.departmentIds ?? [],
      bookingLabel: trimmedOrNull(input.bookingLabel),
      slug,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(eventRef.collection('members').doc(uid), {
      role: 'production-manager',
      addedBy: uid,
      addedAt: now,
      uid,
    });
  });
  return { eventId: input.eventId };
});

/**
 * Load an event the caller is authorized to read (admin or a member). Performs the
 * existence + membership checks (identical reads/throws for every PDF endpoint) and
 * returns the event snapshot.
 */
async function loadAuthorizedEvent(
  db: Firestore,
  eventId: string,
  uid: string,
  token: DecodedIdToken,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  await assertActiveUser({ uid, token }); // pending/revoked accounts can't act, mirroring firestore.rules
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'Event not found.');
  }
  if (token.admin !== true) {
    const member = await db.doc(`events/${eventId}/members/${uid}`).get();
    if (!member.exists) {
      throw new HttpsError('permission-denied', 'Not a member of this event.');
    }
  }
  return eventSnap;
}

/** One image variant of a logo: a Storage object path + its download URL. */
interface LogoImageRef {
  path: string;
}

/** A brand logo: a pair of background-specific variants. Mirrors the client `Logo` shape. */
interface LogoRef {
  onDark: LogoImageRef | null;
  onLight: LogoImageRef | null;
}

/** The max number of marks rendered in the packet logo row (matches the client). */
const MAX_PACKET_LOGOS = 3;

/** The largest logo image we'll embed; anything bigger is skipped (keeps the PDF small). */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Read a `{ path }` image variant from raw Firestore data, or null if absent/malformed. */
function parseLogoImage(v: unknown): LogoImageRef | null {
  if (!v || typeof v !== 'object') return null;
  const path = (v as DocumentData).path;
  return typeof path === 'string' && path.trim() ? { path } : null;
}

/** Read a logo (pair of variants) from raw Firestore data, or null if it has no usable variant. */
function parseLogoRef(v: unknown): LogoRef | null {
  if (!v || typeof v !== 'object') return null;
  const onDark = parseLogoImage((v as DocumentData).onDark);
  const onLight = parseLogoImage((v as DocumentData).onLight);
  if (!onDark && !onLight) return null;
  return { onDark, onLight };
}

/** Pick a logo's variant for a background, falling back to the other when missing. */
function variantForBackground(logo: LogoRef, background: 'dark' | 'light'): LogoImageRef | null {
  const primary = background === 'dark' ? logo.onDark : logo.onLight;
  const fallback = background === 'dark' ? logo.onLight : logo.onDark;
  return primary ?? fallback;
}

/**
 * Download a Storage object once and base64-encode it to a data URI. Defensive: a missing,
 * oversized, or failed download returns null (logged) rather than throwing, so a bad logo
 * never breaks packet generation. Results are memoized per-path in `cache`.
 */
async function loadLogoDataUri(path: string, cache: Map<string, string | null>): Promise<string | null> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;

  let dataUri: string | null = null;
  try {
    const file = getStorage().bucket(STORAGE_BUCKET).file(path);
    const [metadata] = await file.getMetadata();
    const size = typeof metadata.size === 'number' ? metadata.size : Number(metadata.size ?? 0);
    if (size > MAX_LOGO_BYTES) {
      logger.warn('generatePacket: logo too large; skipping', { path, size });
    } else {
      const [buffer] = await file.download();
      const contentType = metadata.contentType ?? 'image/png';
      dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    logger.warn('generatePacket: logo download failed; skipping', { path, err });
  }
  cache.set(path, dataUri);
  return dataUri;
}

/**
 * Assemble the effective logo row for an event: the event's `eventLogo` first, then the
 * app-level shared defaults (`config/branding.defaultLogos`), keeping only logos with a usable
 * variant and capping at 3. Each kept logo is resolved to cover (onDark→onLight) and header
 * (onLight→onDark) data URIs. Distinct Storage paths are downloaded once. Never throws.
 */
async function resolvePacketLogos(
  db: Firestore,
  ev: DocumentData,
): Promise<{ eventLogo: PacketLogo | null; markLogos: PacketLogo[] }> {
  const brandingSnap = await db.doc('config/branding').get();
  const defaults = asArray(brandingSnap.exists ? (brandingSnap.data()?.defaultLogos ?? []) : []);
  const cache = new Map<string, string | null>();
  const resolve = async (logo: LogoRef): Promise<PacketLogo> => {
    const cover = variantForBackground(logo, 'dark');
    const header = variantForBackground(logo, 'light');
    return {
      coverDataUri: cover ? await loadLogoDataUri(cover.path, cache) : null,
      headerDataUri: header ? await loadLogoDataUri(header.path, cache) : null,
    };
  };

  const eventRef = parseLogoRef(ev.eventLogo);
  const eventLogo = eventRef ? await resolve(eventRef) : null;
  const markRefs = defaults
    .map(parseLogoRef)
    .filter((l): l is LogoRef => l !== null)
    .slice(0, MAX_PACKET_LOGOS - (eventLogo ? 1 : 0));
  const markLogos = await Promise.all(markRefs.map(resolve));
  return { eventLogo, markLogos };
}

/**
 * Generate a 46-branded full-event PDF packet (production record + stages + artist
 * advances) and store it in Storage. Authorized for admin or any member of the event.
 * Returns the Storage `{ path }`; the client resolves a download URL (member-gated by
 * storage.rules). Input: { eventId }.
 */
/** An advance's packet-flagged documents (include-in-packet), in stage/advance order. */
async function collectPacketAttachments(
  db: Firestore,
  eventId: string,
  stageDocs: readonly QueryDocumentSnapshot[],
): Promise<PacketAttachment[]> {
  const attachments: PacketAttachment[] = [];
  for (const sd of stageDocs) {
    const advSnap = await db.collection(`events/${eventId}/stages/${sd.id}/advances`).get();
    const ordered = advSnap.docs.sort((a, b) =>
      String(a.data().artistName ?? '').localeCompare(String(b.data().artistName ?? '')),
    );
    for (const adv of ordered) {
      const docsSnap = await db
        .collection(`events/${eventId}/stages/${sd.id}/advances/${adv.id}/documents`)
        .where('includePacket', '==', true)
        .get();
      for (const d of docsSnap.docs) {
        const data = d.data();
        if (typeof data.fileId !== 'string' || !data.fileId) continue;
        attachments.push({
          artistName: String(adv.data().artistName ?? 'Artist'),
          title: String(data.displayName ?? '') || String(data.name ?? 'Document'),
          mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
          fileId: data.fileId,
        });
      }
    }
  }
  return attachments;
}

export const generatePacket = onCall(
  { memory: '1GiB', timeoutSeconds: 180, secrets: [DRIVE_SA_KEY] },
  async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const { eventId } = parseCallableData(generatePacketInputSchema, request.data);

  const db = getFirestore();
  await enforceRateLimit(db, ['generatePacket', uid], 10);
  const eventSnap = await loadAuthorizedEvent(db, eventId, uid, token);
  const ev = eventSnap.data() ?? {};

  const deptSnap = await db.collection('departments').get();
  const deptName = new Map(deptSnap.docs.map((d) => [d.id, (d.data().name as string) ?? d.id]));
  const departmentIds: string[] = Array.isArray(ev.departmentIds) ? ev.departmentIds : [];
  const departments = departmentIds.map((id) => ({ id, name: deptName.get(id) ?? id }));

  const epSnap = await db.doc(`events/${eventId}/production/record`).get();
  const ep = epSnap.exists ? (epSnap.data() ?? {}) : {};

  const stageDocs = (await db.collection(`events/${eventId}/stages`).get()).docs.sort(
    (a, b) => ((a.data().order as number) ?? 0) - ((b.data().order as number) ?? 0),
  );
  const stages = await Promise.all(
    stageDocs.map(async (sd) => {
      const spSnap = await db.doc(`events/${eventId}/stages/${sd.id}/production/record`).get();
      const advSnap = await db.collection(`events/${eventId}/stages/${sd.id}/advances`).get();
      const advances = advSnap.docs
        .map((ad) => ad.data())
        .sort((a, b) => String(a.artistName ?? '').localeCompare(String(b.artistName ?? '')))
        .map((a) => ({
          artistName: String(a.artistName ?? ''),
          performanceDate: fmtDate(a.performanceDate, String(ev.timeZone ?? 'America/Chicago')),
          stage: a.stage ?? null,
          notes: a.notes ?? null,
          additions: a.additions ?? null,
          concerns: a.concerns ?? null,
          pending: a.pending ?? null,
          sections: a.sections ?? {},
          content: a.content ?? {},
        }));
      return {
        name: String(sd.data().name ?? 'Stage'),
        production: spSnap.exists ? (spSnap.data()?.content ?? {}) : {},
        advances,
      };
    }),
  );

  const logos = await resolvePacketLogos(db, ev);

  const data: PacketData = {
    event: {
      name: String(ev.name ?? ''),
      venue: ev.venue ?? null,
      dateRange: fmtRange(ev.startDate, ev.endDate, String(ev.timeZone ?? 'America/Chicago')),
    },
    departments,
    eventProduction: {
      info: ep.info ?? {},
      contacts: ep.contacts ?? [],
      links: ep.links ?? [],
    },
    stages,
    logos,
    generatedAt: PACKET_DATE_FMT.format(new Date()),
  };

  let buffer = await renderPacket(data);
  // Documents PR 5: append each advance's include-in-packet documents (fetched via the
  // docs-broker SA) — divider page per artist, PDFs merged, photos as fitted pages.
  const attachments = await collectPacketAttachments(db, eventId, stageDocs);
  if (attachments.length > 0) {
    const drive = brokerDriveClient();
    buffer = await appendPacketAttachments(buffer, attachments, (fileId, mime) =>
      fetchBrokeredFileBytes(drive, fileId, mime, MAX_EMBED_BYTES),
    );
  }
  const path = `events/${eventId}/packets/${Date.now()}.pdf`;
  await getStorage().bucket(STORAGE_BUCKET).file(path).save(buffer, { contentType: 'application/pdf' });
  return { path };
  },
);

interface QuotePdfRef {
  eventId: string;
  stageId: string;
  advanceId: string;
  quoteId: string;
}

/** Validate the generateQuotePdf payload. Throws on any missing/blank id. */
function parseQuotePdfRef(data: unknown): QuotePdfRef {
  return parseCallableData(generateQuotePdfInputSchema, data);
}

/** Normalize a quote's line items into priced rows for the PDF. */
function buildQuoteLines(q: DocumentData): QuotePdfData['quote']['lines'] {
  return asArray(q.lineItems).map((raw) => {
    const li = raw as DocumentData;
    const quantity = typeof li.quantity === 'number' ? li.quantity : 0;
    const unitPrice = typeof li.unitPrice === 'number' ? li.unitPrice : 0;
    return {
      description: String(li.description ?? ''),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };
  });
}

/**
 * Generate a 46-branded PDF for a single quote/estimate and store it in Storage. Authorized
 * for admin or any member of the event. Returns the Storage `{ path }`; the client resolves
 * a member-gated download URL. Input: { eventId, stageId, advanceId, quoteId }.
 */
export const generateQuotePdf = onCall({ memory: '512MiB', timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, quoteId } = parseQuotePdfRef(request.data ?? {});

  const db = getFirestore();
  await enforceRateLimit(db, ['generateQuotePdf', uid], 10);
  const eventSnap = await loadAuthorizedEvent(db, eventId, uid, token);

  const advancePath = `events/${eventId}/stages/${stageId}/advances/${advanceId}`;
  const [advanceSnap, quoteSnap] = await Promise.all([
    db.doc(advancePath).get(),
    db.doc(`${advancePath}/quotes/${quoteId}`).get(),
  ]);
  if (!quoteSnap.exists) {
    throw new HttpsError('not-found', 'Quote not found.');
  }
  const ev = eventSnap.data() ?? {};
  const adv = advanceSnap.data() ?? {};
  const q = quoteSnap.data() ?? {};

  const lines = buildQuoteLines(q);
  const total = lines.reduce((sum, l) => sum + l.total, 0);
  const statusLabel = String(q.status ?? 'draft');

  const data: QuotePdfData = {
    event: {
      name: String(ev.name ?? ''),
      venue: ev.venue ?? null,
      dateRange: fmtRange(ev.startDate, ev.endDate, String(ev.timeZone ?? 'America/Chicago')),
    },
    artistName: String(adv.artistName ?? ''),
    quote: {
      title: String(q.title ?? 'Quote'),
      statusLabel: statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1),
      notes: q.notes ?? null,
      decisionNote: q.decisionNote ?? null,
      lines,
      total: fmtMoney(total),
    },
    generatedAt: PACKET_DATE_FMT.format(new Date()),
  };

  const buffer = await renderQuote(data);
  const path = `events/${eventId}/quotes/${quoteId}/quote-${Date.now()}.pdf`;
  const file = getStorage().bucket(STORAGE_BUCKET).file(path);
  await file.save(buffer, { contentType: 'application/pdf' });

  // Quotes are shared with the artist (a non-member), so return a signed, expiring
  // URL (7 days — the v4 maximum). Requires the runtime service account to hold
  // roles/iam.serviceAccountTokenCreator on itself to sign; if that grant isn't in
  // place yet, fall back to a member-gated download (the client resolves it).
  try {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
    return { path, url, expiresAt };
  } catch (err) {
    logger.warn('generateQuotePdf: signed-URL generation failed; using member-gated fallback', { err });
    return { path };
  }
});
