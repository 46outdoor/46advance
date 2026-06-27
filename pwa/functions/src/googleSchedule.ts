/**
 * Phase 12b — push schedule items to the event's Google calendar (reuses 11b: per-event
 * calendar + per-user OAuth). Client-orchestrated auto-push: after each save the client calls
 * `pushScheduleItem`, which reconciles one item — create/update its calendar event when it's in
 * the master schedule (`includeInMaster` + has a start time), or remove it otherwise. Deletes
 * call `removeScheduleCalendarEvent`. Graceful when the caller hasn't connected Google.
 */
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  pushScheduleItemInputSchema,
  removeScheduleCalendarEventInputSchema,
} from './contracts/callables/schedules.js';
import { google, type calendar_v3 } from 'googleapis';
import {
  OAUTH_SECRETS,
  TIME_ZONE,
  type AuthClient,
  authedClientForUser,
  assertCanEditEvent,
  ensureEventCalendar,
} from './google.js';

const DEFAULT_DURATION_MIN = 30;

/** Build the Calendar event body for a schedule item (start required). */
function buildEventBody(item: DocumentData, startTs: Timestamp): calendar_v3.Schema$Event {
  const start = startTs.toDate();
  const endTs = item.endAt instanceof Timestamp ? item.endAt : null;
  const end = endTs ? endTs.toDate() : new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
  const lines: string[] = [`Section: ${item.section}`];
  const fields = item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, string>) : {};
  for (const [k, v] of Object.entries(fields)) if (v) lines.push(`${k}: ${v}`);
  return {
    summary: String(item.title ?? 'Schedule item'),
    location: typeof item.location === 'string' && item.location ? item.location : undefined,
    description: lines.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
  };
}

/** Validate the callable input, throwing on a missing/invalid `{ eventId, itemId }`. */
function parsePushInput(data: unknown): { eventId: string; itemId: string } {
  return parseCallableData(pushScheduleItemInputSchema, data);
}

/** Read an event doc's stored `googleCalendarId`, or `null` when missing/blank. */
async function readEventCalendarId(db: Firestore, eventId: string): Promise<string | null> {
  const calendarId = (await db.doc(`events/${eventId}`).get()).data()?.googleCalendarId;
  return typeof calendarId === 'string' && calendarId ? calendarId : null;
}

/** Best-effort delete of a calendar event; swallows "already gone" errors. */
async function deleteCalendarEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch {
    // already gone
  }
}

/** Create or update the calendar event for an item, returning the resulting event id. */
async function upsertCalendarEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  body: calendar_v3.Schema$Event,
  existing: string | null,
): Promise<string | null> {
  if (existing) {
    try {
      await calendar.events.update({ calendarId, eventId: existing, requestBody: body });
      return existing;
    } catch {
      // fall through to (re)create below
    }
  }
  const created = await calendar.events.insert({ calendarId, requestBody: body });
  return created.data.id ?? null;
}

/**
 * Reconcile one schedule item with the event's Google calendar (admin or event PM). In the
 * master schedule with a time → create/update its event; otherwise remove any existing event.
 * Returns `{ synced, reason? }` — `reason: 'not_connected'` when the caller has no Google link
 * (a no-op, so the save isn't blocked). Input: { eventId, itemId }.
 */
export const pushScheduleItem = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, itemId } = parsePushInput(request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['pushScheduleItem', uid], 60);
  await assertCanEditEvent(db, uid, token.admin === true, eventId);

  const itemRef = db.doc(`events/${eventId}/scheduleItems/${itemId}`);
  const snap = await itemRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Schedule item not found.');
  const item = snap.data() ?? {};
  const startTs = item.startAt instanceof Timestamp ? item.startAt : null;
  const shouldHave = item.includeInMaster !== false && startTs !== null;
  const existing = typeof item.googleCalendarEventId === 'string' ? item.googleCalendarEventId : null;

  let client: AuthClient;
  try {
    client = await authedClientForUser(db, uid);
  } catch {
    return { synced: false, reason: 'not_connected' };
  }
  const calendar = google.calendar({ version: 'v3', auth: client });
  const now = FieldValue.serverTimestamp();

  // Not (or no longer) in the master schedule — remove any existing calendar event.
  if (!shouldHave) {
    if (existing) {
      const calendarId = await readEventCalendarId(db, eventId);
      if (calendarId) await deleteCalendarEvent(calendar, calendarId, existing);
      await itemRef.set({ googleCalendarEventId: null, updatedAt: now }, { merge: true });
    }
    return { synced: true, removed: true };
  }

  // In the master schedule — ensure the calendar exists, then create/update the event.
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const calendarId = await ensureEventCalendar(db, client, uid, eventId, String(eventSnap.data()?.name ?? 'Event'));
  const body = buildEventBody(item, startTs!);

  const calEventId = await upsertCalendarEvent(calendar, calendarId, body, existing);
  await itemRef.set({ googleCalendarEventId: calEventId, updatedAt: now }, { merge: true });
  return { synced: true, calendarEventId: calEventId };
});

/**
 * Remove a schedule item's calendar event (called by the client just before deleting the item,
 * since the doc is then gone). Admin or event PM. Input: { eventId, calendarEventId }.
 */
export const removeScheduleCalendarEvent = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, calendarEventId } = parseCallableData(removeScheduleCalendarEventInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['removeScheduleCalendarEvent', uid], 60);
  await assertCanEditEvent(db, uid, token.admin === true, eventId);

  let client: AuthClient;
  try {
    client = await authedClientForUser(db, uid);
  } catch {
    return { removed: false, reason: 'not_connected' };
  }
  const calendarId = (await db.doc(`events/${eventId}`).get()).data()?.googleCalendarId;
  if (typeof calendarId === 'string' && calendarId) {
    const calendar = google.calendar({ version: 'v3', auth: client });
    try {
      await calendar.events.delete({ calendarId, eventId: calendarEventId });
    } catch {
      // already gone
    }
  }
  return { removed: true };
});
