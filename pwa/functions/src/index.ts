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
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { renderPacket, type PacketData } from './lib/pdf/packet.js';
import { renderQuote, fmtMoney, type QuotePdfData } from './lib/pdf/quote.js';

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

/** Emails granted the global admin role (allowlist). */
const ADMIN_EMAILS = ['jared@46entertainment.com'].map((email) => email.toLowerCase());

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
  const isAdmin = email !== null && ADMIN_EMAILS.includes(email.toLowerCase());

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  const isOrganizer = existing.organizer === true;

  const db = getFirestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  // Admin-approval gate: admins are always approved; a brand-new account starts PENDING;
  // pre-existing accounts are grandfathered approved (unless an admin explicitly revoked).
  const approved = isAdmin ? true : snap.exists ? existing.approved !== false : false;

  if (existing.admin !== isAdmin || existing.approved !== approved) {
    await adminAuth.setCustomUserClaims(uid, { ...existing, admin: isAdmin, approved });
  }

  await ref.set(
    {
      email,
      displayName: token.name ?? null,
      isAdmin,
      organizer: isOrganizer,
      approved,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  // Mirror the account into the global contacts directory (contacts/{uid}). Create-only so
  // an admin's later edits to the contact aren't overwritten on each sign-in.
  const contactRef = db.collection('contacts').doc(uid);
  if (!(await contactRef.get()).exists) {
    const now = FieldValue.serverTimestamp();
    await contactRef.set({
      name: token.name ?? email ?? 'Team member',
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
  }

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
  const uid = request.data?.uid;
  const approved = request.data?.approved;
  if (typeof uid !== 'string' || uid.length === 0 || typeof approved !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Expected { uid: string, approved: boolean }.');
  }

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
  const uid = request.data?.uid;
  const organizer = request.data?.organizer;
  if (typeof uid !== 'string' || uid.length === 0 || typeof organizer !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Expected { uid: string, organizer: boolean }.');
  }

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, organizer });
  await getFirestore().collection('users').doc(uid).set({ organizer }, { merge: true });

  return { uid, organizer };
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
function parseNewEventInput(data: DocumentData): NewEventInput {
  const templateId = data.templateId;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (typeof templateId !== 'string' || templateId.length === 0 || name.length === 0) {
    throw new HttpsError('invalid-argument', 'Expected { templateId: string, name: string }.');
  }
  return {
    templateId,
    name,
    startDate: toTimestamp(data.startDate),
    endDate: toTimestamp(data.endDate),
    venue: trimmedOrNull(data.venue),
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
  const eventId = request.data?.eventId;
  if (typeof eventId !== 'string' || eventId.length === 0) {
    throw new HttpsError('invalid-argument', 'Expected { eventId: string }.');
  }

  const db = getFirestore();
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

  const data: PacketData = {
    event: { name: String(ev.name ?? ''), venue: ev.venue ?? null, dateRange: fmtRange(ev.startDate, ev.endDate) },
    departments,
    eventProduction: {
      info: ep.info ?? {},
      contacts: ep.contacts ?? [],
      links: ep.links ?? [],
    },
    stages,
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
function parseQuotePdfRef(data: DocumentData): QuotePdfRef {
  const { eventId, stageId, advanceId, quoteId } = data;
  if (
    typeof eventId !== 'string' ||
    typeof stageId !== 'string' ||
    typeof advanceId !== 'string' ||
    typeof quoteId !== 'string' ||
    !eventId ||
    !stageId ||
    !advanceId ||
    !quoteId
  ) {
    throw new HttpsError('invalid-argument', 'Expected { eventId, stageId, advanceId, quoteId }.');
  }
  return { eventId, stageId, advanceId, quoteId };
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
  await getStorage().bucket(STORAGE_BUCKET).file(path).save(buffer, { contentType: 'application/pdf' });
  return { path };
});
