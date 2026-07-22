/**
 * Phase 11b (sync) — match Google Appointment Schedule bookings to advances.
 *
 * The artist self-books via a Google Appointment Schedule link; the booking lands as a
 * timed event (with a Meet link) on the connecting user's **primary** Google Calendar,
 * with the artist name in an "Artist Name" custom question. We read those events, parse
 * the artist + festival + Meet link, and match to advances by normalized artist name:
 *   - exactly one unlinked advance matches  → auto-attach (write time + Meet link back)
 *   - anything ambiguous                     → queued in events/{id}/callBookings for review
 *
 * Two entry points share `syncEventBookings`: a manual per-event callable, and a cron
 * (every 2h business hours / 4h off-hours, Central).
 *
 * UTC discipline: a booking's `start.dateTime` is an RFC3339 string WITH offset, so
 * `new Date(...).getTime()` yields the correct absolute instant — no manual zone math.
 * We persist instants as `Timestamp`/epoch-millis (UTC); the client renders them in Central.
 */
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import { withGoogleRetry } from './lib/google/retry.js';
import { attachCallBookingInputSchema, syncAdvanceCallBookingsInputSchema } from './contracts/callables/google.js';
import { logger } from 'firebase-functions/v2';
import { google, type calendar_v3 } from 'googleapis';
import { OAUTH_SECRETS, TIME_ZONE, type AuthClient, authedClientForUser, assertCanEditEvent } from './google.js';

const WINDOW_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_FUTURE_MS = 120 * 24 * 60 * 60 * 1000;

interface Booking {
  calendarEventId: string;
  artistName: string;
  festival: string | null;
  startMillis: number;
  endMillis: number | null;
  meetLink: string | null;
  booker: string | null;
}

/** Loose HTML→text for calendar descriptions (Appointment Schedule writes light HTML). */
function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

/** Pull a labeled field from a description: handles "Label: value" and "Label\nvalue". */
export function extractField(description: string, label: string): string | null {
  const lines = stripHtml(description)
    .split(/\r?\n/)
    .map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const inline = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, 'i').exec(lines[i]);
    if (inline) return inline[1].trim();
    if (new RegExp(`^${label}\\s*$`, 'i').test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]) return lines[j];
      }
    }
  }
  return null;
}

/** Match key for an artist name: lowercase, accent-folded, punctuation→spaces, collapsed. */
export function normalizeArtist(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parse a calendar event into a booking, or null if it isn't an advance booking. Requires a
 * Meet link plus an advance signal (an "Artist Name" field or "Advance" in the title), and a
 * timed start (all-day events are skipped).
 */
export function parseBooking(event: calendar_v3.Schema$Event): Booking | null {
  const id = event.id;
  const startIso = event.start?.dateTime;
  if (!id || !startIso) return null;
  const startMillis = new Date(startIso).getTime();
  if (Number.isNaN(startMillis)) return null;

  const summary = event.summary ?? '';
  const description = event.description ?? '';
  const meetLink =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
    null;

  const artistFromDesc = extractField(description, 'Artist Name');
  const isAdvance = Boolean(artistFromDesc) || /advance/i.test(summary);
  if (!meetLink || !isAdvance) return null;

  const segments = summary.split('|').map((s) => s.trim()).filter(Boolean);
  const festival = segments.length >= 1 ? segments[0] : null;
  const artistFromTitle = segments.length >= 2 ? segments[1] : null;
  const artistName = (artistFromDesc || artistFromTitle || '').trim();
  if (!artistName) return null;

  const endIso = event.end?.dateTime;
  return {
    calendarEventId: id,
    artistName,
    festival,
    startMillis,
    endMillis: endIso ? new Date(endIso).getTime() : null,
    meetLink,
    booker: extractField(description, 'Booked by'),
  };
}

/** The booking fields persisted on a callBookings doc (instant stored as UTC). */
function bookingDoc(b: Booking) {
  return {
    calendarEventId: b.calendarEventId,
    artistName: b.artistName,
    festival: b.festival,
    startMillis: b.startMillis,
    startAt: Timestamp.fromMillis(b.startMillis),
    endMillis: b.endMillis,
    meetLink: b.meetLink,
    booker: b.booker,
  };
}

interface AdvanceRef {
  advanceId: string;
  stageId: string;
  artistKey: string;
  hasCall: boolean;
  linkedEventId: string | null;
}

export interface SyncResult {
  scanned: number;
  attached: number;
  needsReview: number;
}

/** A Firestore server timestamp, or a value already persisted from a prior sync. */
type SyncedAt = FieldValue | Timestamp;

/** Index this event's advances by artist match-key (one row per advance, across all stages). */
async function buildAdvanceIndex(db: Firestore, eventId: string): Promise<AdvanceRef[]> {
  const advances: AdvanceRef[] = [];
  const stagesSnap = await db.collection(`events/${eventId}/stages`).get();
  for (const stage of stagesSnap.docs) {
    const advSnap = await db.collection(`events/${eventId}/stages/${stage.id}/advances`).get();
    for (const a of advSnap.docs) {
      const d = a.data();
      advances.push({
        advanceId: a.id,
        stageId: stage.id,
        artistKey: normalizeArtist(String(d.artistName ?? '')),
        hasCall: Boolean(d.advanceCallLink) || Boolean(d.advanceCallAt),
        linkedEventId: typeof d.googleCalendarEventId === 'string' ? d.googleCalendarEventId : null,
      });
    }
  }
  return advances;
}

/**
 * True when a booking is out of this event's festival scope and should be skipped.
 * No label → never out-of-scope here (the artist-match check handles scoping instead).
 */
function isOutOfFestivalScope(labelKey: string, festival: string | null): boolean {
  if (!labelKey) return false;
  const fest = normalizeArtist(festival ?? '');
  return !fest || (!fest.includes(labelKey) && !labelKey.includes(fest));
}

/** Re-sync a booking whose calendar event is already linked to an advance (counts as scanned only). */
async function writeAlreadyLinked(
  bookingRef: FirebaseFirestore.DocumentReference,
  b: Booking,
  linked: AdvanceRef | undefined,
  syncedAt: SyncedAt,
  nowTs: FieldValue,
): Promise<void> {
  await bookingRef.set(
    {
      ...bookingDoc(b),
      status: 'attached',
      matchedAdvanceId: linked?.advanceId ?? null,
      matchedStageId: linked?.stageId ?? null,
      reason: null,
      syncedAt,
      updatedAt: nowTs,
    },
    { merge: true },
  );
}

/**
 * Auto-attach a confident single match, transactionally. Re-reads the advance inside a
 * transaction and only writes if it has no call yet (or is already linked to THIS booking) —
 * so a concurrent manual+cron run, or a second same-artist booking in the same run, can't
 * clobber an attach that already landed. Returns whether it claimed the advance; on a lost
 * race the caller queues the booking for review instead. Only marks the booking attached on
 * success.
 */
async function writeConfidentAttach(
  db: Firestore,
  eventId: string,
  bookingRef: FirebaseFirestore.DocumentReference,
  b: Booking,
  m: AdvanceRef,
  syncedAt: SyncedAt,
  nowTs: FieldValue,
): Promise<boolean> {
  const advanceRef = db.doc(`events/${eventId}/stages/${m.stageId}/advances/${m.advanceId}`);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(advanceRef);
    if (!snap.exists) return false;
    const data = snap.data() ?? {};
    const linkedId = typeof data.googleCalendarEventId === 'string' ? data.googleCalendarEventId : null;
    const hasCall = Boolean(data.advanceCallAt) || Boolean(data.advanceCallLink) || Boolean(linkedId);
    // Eligible only if no call is attached yet, or it's already this exact booking (idempotent re-sync).
    if (hasCall && linkedId !== b.calendarEventId) return false;
    tx.set(
      advanceRef,
      {
        advanceCallAt: Timestamp.fromMillis(b.startMillis),
        advanceCallLink: b.meetLink,
        googleCalendarEventId: b.calendarEventId,
        updatedAt: nowTs,
      },
      { merge: true },
    );
    return true;
  });
  if (!claimed) return false;
  await bookingRef.set(
    {
      ...bookingDoc(b),
      status: 'attached',
      matchedAdvanceId: m.advanceId,
      matchedStageId: m.stageId,
      reason: null,
      syncedAt,
      updatedAt: nowTs,
    },
    { merge: true },
  );
  return true;
}

/** Queue an ambiguous booking for manual review, recording why and the best suggestion. */
async function writeNeedsReview(
  bookingRef: FirebaseFirestore.DocumentReference,
  b: Booking,
  matches: AdvanceRef[],
  syncedAt: SyncedAt,
  nowTs: FieldValue,
): Promise<void> {
  const reason = matches.length === 0 ? 'no_match' : matches.length > 1 ? 'multiple_matches' : 'already_linked';
  const suggestion = matches[0] ?? null;
  await bookingRef.set(
    {
      ...bookingDoc(b),
      status: 'needs_review',
      reason,
      suggestedAdvanceId: suggestion?.advanceId ?? null,
      suggestedStageId: suggestion?.stageId ?? null,
      matchedAdvanceId: null,
      matchedStageId: null,
      syncedAt,
      updatedAt: nowTs,
    },
    { merge: true },
  );
}

/**
 * Read the user's primary calendar, match advance bookings to this event's advances, and
 * auto-attach confident matches / queue the rest. Pure-ish: takes an authed client + db.
 */
export async function syncEventBookings(
  db: Firestore,
  client: AuthClient,
  eventId: string,
): Promise<SyncResult> {
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) return { scanned: 0, attached: 0, needsReview: 0 };
  const bookingLabel = String(eventSnap.data()?.bookingLabel ?? '').trim();
  const labelKey = bookingLabel ? normalizeArtist(bookingLabel) : '';

  const advances = await buildAdvanceIndex(db, eventId);
  const linkedCalIds = new Set(advances.map((a) => a.linkedEventId).filter((id): id is string => Boolean(id)));

  const now = Date.now();
  const calendar = google.calendar({ version: 'v3', auth: client });
  // Page through ALL matching calendar events, not just the first 250 (WS-H): a busy festival can
  // have more advance bookings in the window than one page holds, and the overflow was silently dropped.
  const calendarItems: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withGoogleRetry(
      () =>
        calendar.events.list({
          calendarId: 'primary',
          timeMin: new Date(now - WINDOW_PAST_MS).toISOString(),
          timeMax: new Date(now + WINDOW_FUTURE_MS).toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          q: 'Advance',
          pageToken,
        }),
      { label: 'events.list' },
    );
    calendarItems.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const existingSnap = await db.collection(`events/${eventId}/callBookings`).get();
  const existing = new Map<string, DocumentData>(existingSnap.docs.map((d) => [d.id, d.data()]));

  const nowTs = FieldValue.serverTimestamp();
  let scanned = 0;
  let attached = 0;
  let needsReview = 0;

  for (const item of calendarItems) {
    const b = parseBooking(item);
    if (!b) continue;

    // Scope to this event by booking label (festival segment), when set.
    if (isOutOfFestivalScope(labelKey, b.festival)) continue;

    const key = normalizeArtist(b.artistName);
    const matches = advances.filter((a) => a.artistKey && a.artistKey === key);
    // No label → only surface bookings that match an advance here (avoid cross-festival noise).
    if (!labelKey && matches.length === 0) continue;
    scanned++;

    const bookingRef = db.doc(`events/${eventId}/callBookings/${b.calendarEventId}`);
    const prior = existing.get(b.calendarEventId);
    if (prior?.status === 'dismissed') continue;
    const syncedAt: SyncedAt = prior?.syncedAt ?? nowTs;

    if (linkedCalIds.has(b.calendarEventId)) {
      const linked = advances.find((a) => a.linkedEventId === b.calendarEventId);
      await writeAlreadyLinked(bookingRef, b, linked, syncedAt, nowTs);
      continue;
    }

    const unlinked = matches.filter((a) => !a.hasCall && !a.linkedEventId);
    if (matches.length === 1 && unlinked.length === 1) {
      const target = unlinked[0];
      const didAttach = await writeConfidentAttach(db, eventId, bookingRef, b, target, syncedAt, nowTs);
      if (didAttach) {
        // Mutate the in-memory index so a second same-artist booking this run can't re-attach
        // the same advance (it'll fall through to needs_review as 'already_linked' instead).
        target.hasCall = true;
        target.linkedEventId = b.calendarEventId;
        attached++;
      } else {
        await writeNeedsReview(bookingRef, b, matches, syncedAt, nowTs);
        needsReview++;
      }
    } else {
      await writeNeedsReview(bookingRef, b, matches, syncedAt, nowTs);
      needsReview++;
    }
  }

  return { scanned, attached, needsReview };
}

/**
 * Manual "Sync now" for one event. Admin or the event's production manager only.
 * Input: { eventId }. Returns { scanned, attached, needsReview }.
 */
export const syncAdvanceCallBookings = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId } = parseCallableData(syncAdvanceCallBookingsInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['syncAdvanceCallBookings', uid], 10);
  await assertCanEditEvent(db, token, uid, eventId);
  const client = await authedClientForUser(db, uid);
  return syncEventBookings(db, client, eventId);
});

/**
 * Manually attach a reviewed booking to an advance, ATOMICALLY (WS-G). The old client path was
 * two separate `updateDoc`s with no read-back: it blindly stomped the advance's call fields even
 * if the cron auto-attach had just claimed it for a DIFFERENT booking, and a failure between the
 * two writes could leave a linked advance still sitting in the review queue. This callable does
 * both writes in one transaction and — when it displaces a booking that was already attached to
 * this advance — returns THAT booking to the review queue instead of silently orphaning it. The
 * server re-reads the booking doc for the call time + Meet link (source of truth), not the client.
 * Admin or the event's production manager only. Returns { attached, requeuedBookingId }.
 */
export const attachCallBooking = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, bookingId } = parseCallableData(attachCallBookingInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['attachCallBooking', uid], 60);
  await assertCanEditEvent(db, token, uid, eventId);

  const bookingRef = db.doc(`events/${eventId}/callBookings/${bookingId}`);
  const advanceRef = db.doc(`events/${eventId}/stages/${stageId}/advances/${advanceId}`);

  return db.runTransaction(async (tx) => {
    // --- reads (all before any write) ---
    const [bookingSnap, advanceSnap] = await tx.getAll(bookingRef, advanceRef);
    if (!bookingSnap.exists) throw new HttpsError('not-found', 'Booking not found.');
    if (!advanceSnap.exists) throw new HttpsError('not-found', 'Advance not found.');
    const startMillis = typeof bookingSnap.get('startMillis') === 'number'
      ? (bookingSnap.get('startMillis') as number) : null;
    if (startMillis === null) throw new HttpsError('failed-precondition', 'Booking has no start time.');
    const meetLink = typeof bookingSnap.get('meetLink') === 'string' ? (bookingSnap.get('meetLink') as string) : null;

    // A booking already attached to THIS advance (different from the one we're attaching) is
    // displaced — read it so we can requeue it rather than leaking it out of the review queue.
    const prevLinked = typeof advanceSnap.get('googleCalendarEventId') === 'string'
      ? (advanceSnap.get('googleCalendarEventId') as string) : null;
    const displacedId = prevLinked && prevLinked !== bookingId ? prevLinked : null;
    const displacedRef = displacedId ? db.doc(`events/${eventId}/callBookings/${displacedId}`) : null;
    const displacedSnap = displacedRef ? await tx.get(displacedRef) : null;

    // --- writes ---
    const nowTs = FieldValue.serverTimestamp();
    tx.set(
      advanceRef,
      {
        advanceCallAt: Timestamp.fromMillis(startMillis),
        advanceCallLink: meetLink,
        googleCalendarEventId: bookingId,
        updatedAt: nowTs,
      },
      { merge: true },
    );
    tx.set(
      bookingRef,
      { status: 'attached', matchedAdvanceId: advanceId, matchedStageId: stageId, reason: null, updatedAt: nowTs },
      { merge: true },
    );
    let requeuedBookingId: string | null = null;
    if (displacedRef && displacedSnap?.exists && displacedSnap.get('status') === 'attached') {
      tx.set(
        displacedRef,
        { status: 'needs_review', reason: 'already_linked', matchedAdvanceId: null, matchedStageId: null, updatedAt: nowTs },
        { merge: true },
      );
      requeuedBookingId = displacedId;
    }
    return { attached: true, requeuedBookingId };
  });
});

/**
 * Scheduled auto-sync: every 2h during business hours (9–17) and every 4h off-hours,
 * Central. For each connected user, syncs the events they production-manage.
 */
export const scheduledAdvanceCallSync = onSchedule(
  {
    schedule: '0 1,5,9,11,13,15,17,21 * * *',
    timeZone: TIME_ZONE,
    secrets: OAUTH_SECRETS,
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const db = getFirestore();
    const connections = await db.collection('googleConnections').get();
    for (const conn of connections.docs) {
      const uid = conn.id;
      // Authoritative active-user check (F-2): skip revoked/deleted users immediately — a
      // revoked user's connection doc may linger before full disconnect, and a background job
      // must never keep processing them just because an old token is still on file.
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists || userSnap.get('approved') === false) continue;
      let client: AuthClient;
      try {
        client = await authedClientForUser(db, uid);
      } catch {
        continue; // not connected / no refresh token
      }
      const memberDocs = await db.collectionGroup('members').where('uid', '==', uid).get();
      const eventIds = new Set<string>();
      for (const m of memberDocs.docs) {
        if (m.data().role === 'production-manager') {
          const eid = m.ref.parent.parent?.id;
          if (eid) eventIds.add(eid);
        }
      }
      for (const eventId of eventIds) {
        try {
          const r = await syncEventBookings(db, client, eventId);
          if (r.attached || r.needsReview) {
            logger.info('advance-call sync', { uid, eventId, ...r });
          }
        } catch (err) {
          // Log only the message (WS-H): a raw gaxios error object carries the request's
          // Authorization: Bearer <access_token> header + the Google response body into Cloud Logging.
          logger.error('advance-call sync failed', { uid, eventId, error: String(err) });
        }
      }
    }
  },
);
