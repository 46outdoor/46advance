import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type WriteBatch,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { renderPacket, type PacketData, type PacketLogo } from './lib/pdf/packet.js';
import { renderQuote, fmtMoney, type QuotePdfData } from './lib/pdf/quote.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseAdminEmails, isAdminEmail } from './lib/auth/adminAllowlist.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  deleteUserInputSchema,
  setUserApprovedInputSchema,
  setUserDisplayNameInputSchema,
  setUserOrganizerInputSchema,
} from './contracts/callables/auth.js';
import { resolveDisplayName } from './lib/auth/displayName.js';
import { createEventFromTemplateInputSchema } from './contracts/callables/events.js';
import { generatePacketInputSchema, generateQuotePdfInputSchema } from './contracts/callables/pdf.js';

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

// Phase 12b — push schedule items to the event's Google calendar. ./googleSchedule.ts.
export { pushScheduleItem, removeScheduleCalendarEvent } from './googleSchedule.js';

// Phase 13 — Google Drive (per-user OAuth): link files to advances + save packets. ./googleDrive.ts.
export { getDriveAccessToken, linkDriveFile, removeDriveFile, savePacketToDrive } from './googleDrive.js';

const STORAGE_BUCKET = 'advancethat.firebasestorage.app';
const PACKET_DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDate = (v: unknown): string | null => (v instanceof Timestamp ? PACKET_DATE_FMT.format(v.toDate()) : null);
const fmtRange = (a: unknown, b: unknown): string | null => {
  const x = fmtDate(a);
  const y = fmtDate(b);
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
  const isAdmin = isAdminEmail(email, ADMIN_EMAILS);

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  const isOrganizer = existing.organizer === true;

  const db = getFirestore();
  await enforceRateLimit(db, ['syncUserClaims', uid], 60);
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  // Admin-approval gate: admins are always approved; a brand-new account starts PENDING;
  // pre-existing accounts are grandfathered approved (unless an admin explicitly revoked).
  const approved = isAdmin ? true : snap.exists ? existing.approved !== false : false;

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
    const linked = await linkOrCreateContact(db, uid, email, token.name ?? null);
    contactId = linked.contactId;
    contactName = linked.contactName;
  }

  await ref.set(
    {
      email,
      // Never clobber an existing/admin-set name; else the token name; else the contact's.
      displayName: resolveDisplayName(userData?.displayName, token.name, contactName),
      contactId,
      isAdmin,
      organizer: isOrganizer,
      approved,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return { isAdmin, isOrganizer, approved };
});

/**
 * Admin-only. Approves/revokes a user's access to the app. Sets the `approved` custom claim
 * and mirrors `users/{uid}.approved`. The target user picks it up on their next token
 * refresh / sign-in. Input: { uid: string, approved: boolean }.
 */
export const setUserApproved = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const { uid, approved } = parseCallableData(setUserApprovedInputSchema, request.data);
  await enforceRateLimit(getFirestore(), ['setUserApproved', request.auth.uid], 30);

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, approved });
  await getFirestore().collection('users').doc(uid).set({ approved }, { merge: true });

  return { uid, approved };
});

/**
 * Admin-only. Grants/revokes the global `organizer` capability (lets a user create
 * events). Sets the custom claim and mirrors `users/{uid}.organizer`. The target
 * user picks up the claim on their next token refresh / sign-in.
 */
export const setUserOrganizer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
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
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
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

/**
 * Admin-only. Permanently deletes an account: the Firebase Auth user + `users/{uid}`,
 * clears the person's event memberships, and unlinks (keeps) their contact as reference
 * data. Cannot delete your own account.
 */
export const deleteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const { uid } = parseCallableData(deleteUserInputSchema, request.data);
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
  }
  const db = getFirestore();
  await enforceRateLimit(db, ['deleteUser', request.auth.uid], 30);

  // Remove the Auth account (tolerate one that's already gone).
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    logger.warn('deleteUser: Auth account not deleted (may not exist)', { uid, err: String(err) });
  }

  // Clear event memberships (members docs mirror the uid field) + unlink their contact(s).
  const memberships = await db.collectionGroup('members').where('uid', '==', uid).get();
  const contacts = await db.collection('contacts').where('userId', '==', uid).get();

  const batch = db.batch();
  memberships.forEach((m) => batch.delete(m.ref));
  contacts.forEach((c) =>
    batch.set(c.ref, { userId: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
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
  venue: string | null;
}

/** Parse + validate the createEventFromTemplate payload. Throws on invalid input. */
function parseNewEventInput(data: unknown): NewEventInput {
  const input = parseCallableData(createEventFromTemplateInputSchema, data);
  return {
    templateId: input.templateId,
    name: input.name, // schema trims + requires non-empty
    startDate: toTimestamp(input.startDate),
    endDate: toTimestamp(input.endDate),
    venue: trimmedOrNull(input.venue),
  };
}

/** Seed the caller as PM, then template members (without clobbering the caller). */
function seedEventMembers(batch: WriteBatch, eventRef: DocumentReference, tpl: DocumentData, uid: string, now: FieldValue): void {
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
function seedEventProduction(batch: WriteBatch, eventRef: DocumentReference, tpl: DocumentData, now: FieldValue): void {
  const ep = (tpl.eventProduction ?? {}) as DocumentData;
  batch.set(eventRef.collection('production').doc('record'), {
    info: ep.info ?? {},
    contacts: asArray(ep.contacts),
    links: asArray(ep.links),
    updatedAt: now,
  });
}

/** Seed stages and their per-stage production records from the template blueprint. */
function seedEventStages(batch: WriteBatch, eventRef: DocumentReference, tpl: DocumentData, now: FieldValue): void {
  const stageProduction = (tpl.stageProduction ?? {}) as DocumentData;
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
    const content = (stageProduction[stage.id] as DocumentData | undefined)?.content;
    if (content && typeof content === 'object') {
      batch.set(stageRef.collection('production').doc('record'), { content, updatedAt: now });
    }
  }
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
  const batch = db.batch();

  const eventRef = db.collection('events').doc();
  batch.set(eventRef, {
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    venue: input.venue,
    status: 'draft',
    departmentIds: asArray(tpl.departmentIds),
    eventLogo: tpl.eventLogo ?? null,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });

  seedEventMembers(batch, eventRef, tpl, uid, now);
  seedEventProduction(batch, eventRef, tpl, now);
  seedEventStages(batch, eventRef, tpl, now);

  await batch.commit();
  return { eventId: eventRef.id };
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
  isAdmin: boolean,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'Event not found.');
  }
  if (!isAdmin) {
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
async function resolvePacketLogos(db: Firestore, ev: DocumentData): Promise<PacketLogo[]> {
  const brandingSnap = await db.doc('config/branding').get();
  const defaults = asArray(brandingSnap.exists ? (brandingSnap.data()?.defaultLogos ?? []) : []);
  const row = [ev.eventLogo, ...defaults]
    .map(parseLogoRef)
    .filter((l): l is LogoRef => l !== null)
    .slice(0, MAX_PACKET_LOGOS);

  const cache = new Map<string, string | null>();
  return Promise.all(
    row.map(async (logo) => {
      const cover = variantForBackground(logo, 'dark');
      const header = variantForBackground(logo, 'light');
      return {
        coverDataUri: cover ? await loadLogoDataUri(cover.path, cache) : null,
        headerDataUri: header ? await loadLogoDataUri(header.path, cache) : null,
      };
    }),
  );
}

/**
 * Generate a 46-branded full-event PDF packet (production record + stages + artist
 * advances) and store it in Storage. Authorized for admin or any member of the event.
 * Returns the Storage `{ path }`; the client resolves a download URL (member-gated by
 * storage.rules). Input: { eventId }.
 */
export const generatePacket = onCall({ memory: '512MiB', timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const { eventId } = parseCallableData(generatePacketInputSchema, request.data);

  const db = getFirestore();
  await enforceRateLimit(db, ['generatePacket', uid], 10);
  const eventSnap = await loadAuthorizedEvent(db, eventId, uid, token.admin === true);
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
          performanceDate: fmtDate(a.performanceDate),
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
    event: { name: String(ev.name ?? ''), venue: ev.venue ?? null, dateRange: fmtRange(ev.startDate, ev.endDate) },
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

  const buffer = await renderPacket(data);
  const path = `events/${eventId}/packets/${Date.now()}.pdf`;
  await getStorage().bucket(STORAGE_BUCKET).file(path).save(buffer, { contentType: 'application/pdf' });
  return { path };
});

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
  const eventSnap = await loadAuthorizedEvent(db, eventId, uid, token.admin === true);

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
    event: { name: String(ev.name ?? ''), venue: ev.venue ?? null, dateRange: fmtRange(ev.startDate, ev.endDate) },
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
