/**
 * Push schedule days to the event's Google calendar (redesign PR 4; reuses 11b: per-event
 * calendar + per-user OAuth). Client-orchestrated auto-push: after a day save the client
 * calls `reconcileScheduleDay`, which reconciles every item of that day — pushToCalendar
 * items with a start time get their events created/updated (instants derived from the
 * day's date + wall-clock times in the event's timezone; `{artist N}` placeholders
 * resolved against the lineup), everything else gets any existing event removed. The
 * per-item `googleCalendarEventId`s write back in a TRANSACTION that patches only that
 * field on the fresh doc, so a concurrent whole-day client save is never clobbered.
 * Deletes call `removeScheduleCalendarEvent` first (the stored id is gone afterwards).
 * Graceful when the caller hasn't connected Google.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  reconcileScheduleDayInputSchema,
  removeScheduleCalendarEventInputSchema,
} from './contracts/callables/schedules.js';
import { google, type calendar_v3 } from 'googleapis';
import { shiftDayKey, zonedInputToDate } from './lib/dates/zonedTime.js';
import {
  OAUTH_SECRETS,
  TIME_ZONE,
  type AuthClient,
  authedClientForUser,
  assertCanEditEvent,
  ensureEventCalendar,
} from './google.js';

const DEFAULT_DURATION_MIN = 30;
const WALL_CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ARTIST_PLACEHOLDER_RE = /\{artist\s+(\d+)\}/gi;

const asWallClock = (v: unknown): string | null =>
  typeof v === 'string' && WALL_CLOCK_RE.test(v) ? v : null;

/** An item belongs on the calendar when it's flagged to push and has a start time. */
function shouldHaveEvent(item: DocumentData): boolean {
  return item.pushToCalendar !== false && asWallClock(item.startTime) !== null;
}

/** Canonical lineup slot label (mirrors the client's slotLabel). */
function slotLabel(slot: number): string {
  if (slot === 1) return 'Headliner';
  if (slot === 2) return 'Direct Support';
  return `Artist ${slot}`;
}

/** Resolve `{artist N}` against the lineup map for the item's stage; unbooked slots
 * render the canonical slot label (matches the client). */
function resolvePlaceholders(text: string, stageId: string | null, artistBySlot: Map<string, string>): string {
  return text.replace(ARTIST_PLACEHOLDER_RE, (_m, n: string) => {
    const slot = Number(n);
    return (stageId ? artistBySlot.get(`${stageId}:${slot}`) : undefined) ?? slotLabel(slot);
  });
}

/** (stageId:slot) → artist for every stage this day's items reference. */
async function loadSlotArtists(
  db: Firestore,
  eventId: string,
  items: readonly DocumentData[],
): Promise<Map<string, string>> {
  const stageIds = [
    ...new Set(items.map((i) => (typeof i.stageId === 'string' && i.stageId ? i.stageId : null)).filter((s): s is string => s !== null)),
  ];
  const map = new Map<string, string>();
  await Promise.all(
    stageIds.map(async (stageId) => {
      const snap = await db.collection(`events/${eventId}/stages/${stageId}/advances`).get();
      for (const doc of snap.docs) {
        const a = doc.data();
        if (typeof a.slot === 'number' && typeof a.artistName === 'string' && a.artistName) {
          map.set(`${stageId}:${a.slot}`, a.artistName);
        }
      }
    }),
  );
  return map;
}

/** Description lines for an item's calendar event: resolved description text, populated
 * per-type fields (minus location — it gets the event's location slot), and crew lines. */
function buildDescriptionLines(
  item: DocumentData,
  stageId: string | null,
  artistBySlot: Map<string, string>,
): string[] {
  const lines: string[] = [];
  if (typeof item.description === 'string' && item.description) {
    lines.push(resolvePlaceholders(item.description, stageId, artistBySlot));
  }
  const fields = item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, string>) : {};
  for (const [k, v] of Object.entries(fields)) if (v && k !== 'location') lines.push(`${k}: ${v}`);
  for (const raw of Array.isArray(item.crew) ? item.crew : []) {
    const line = raw as DocumentData;
    if (typeof line?.type === 'string' && typeof line?.quantity === 'number') {
      lines.push(`(${line.quantity}) ${line.type}${typeof line.hours === 'number' ? ` · ${line.hours}h` : ''}`);
    }
  }
  return lines;
}

/** Build the Calendar event body for one item of a day (start required). Instants derive
 * from the day's date + wall-clock times in the event's timezone; a "+1" (next-day AM)
 * item shifts one date forward, and an end at or before the start rolls overnight. */
function buildEventBody(
  item: DocumentData,
  dateKey: string,
  timeZone: string,
  artistBySlot: Map<string, string>,
): calendar_v3.Schema$Event | null {
  const baseKey = item.nextDay === true ? shiftDayKey(dateKey, 1) : dateKey;
  const startTime = asWallClock(item.startTime);
  const start = startTime ? zonedInputToDate(`${baseKey}T${startTime}`, timeZone) : null;
  if (!start) return null;
  const endTime = asWallClock(item.endTime);
  let end = endTime ? zonedInputToDate(`${baseKey}T${endTime}`, timeZone) : null;
  if (end && end.getTime() <= start.getTime()) {
    end = zonedInputToDate(`${shiftDayKey(baseKey, 1)}T${endTime}`, timeZone);
  }
  if (!end) end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);

  const stageId = typeof item.stageId === 'string' && item.stageId ? item.stageId : null;
  const fields = item.fields && typeof item.fields === 'object' ? (item.fields as Record<string, string>) : {};
  const lines = buildDescriptionLines(item, stageId, artistBySlot);
  return {
    summary: resolvePlaceholders(String(item.item ?? 'Schedule item'), stageId, artistBySlot),
    location: typeof fields.location === 'string' && fields.location ? fields.location : undefined,
    description: lines.join('\n') || undefined,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };
}

/** Read an event doc's stored `googleCalendarId`, or `null` when missing/blank. */
async function readEventCalendarId(db: Firestore, eventId: string): Promise<string | null> {
  const calendarId = (await db.doc(`events/${eventId}`).get()).data()?.googleCalendarId;
  return typeof calendarId === 'string' && calendarId ? calendarId : null;
}

/** True for Google's "this event doesn't exist (anymore)" responses. */
function isNotFoundError(e: unknown): boolean {
  const err = e as { code?: number | string; response?: { status?: number } };
  const status = typeof err?.code === 'number' ? err.code : err?.response?.status;
  return status === 404 || status === 410;
}

/** Delete a calendar event. Swallows only confirmed "already gone" responses — a
 * transient/quota/permission failure propagates so the stored id is never dropped
 * while the Google event still exists. */
async function deleteCalendarEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
  }
}

/** Best-effort variant for orphan cleanup after the write-back committed — failures are
 * logged, never thrown (the reconcile result is already final). */
async function tryDeleteCalendarEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await deleteCalendarEvent(calendar, calendarId, eventId);
  } catch (e) {
    logger.warn('Orphaned calendar event could not be deleted', { eventId, error: String(e) });
  }
}

/** Create or update the calendar event for an item. Recreates only after a confirmed
 * not-found (the stored event was deleted out-of-band) — transient/permission errors
 * propagate rather than minting a duplicate event. */
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
    } catch (e) {
      if (!isNotFoundError(e)) throw e;
    }
  }
  const created = await calendar.events.insert({ calendarId, requestBody: body });
  return created.data.id ?? null;
}

interface ItemResult {
  id: string;
  calendarEventId: string | null;
  changed: boolean;
  /** A brand-new calendar event was inserted for this item (no prior id). */
  created: boolean;
}

/** Reconcile every item of the day against the calendar, returning per-item outcomes. */
async function reconcileItems(
  calendar: calendar_v3.Calendar,
  calendarId: string | null,
  items: readonly DocumentData[],
  dateKey: string,
  timeZone: string,
  artistBySlot: Map<string, string>,
): Promise<ItemResult[]> {
  const results: ItemResult[] = [];
  for (const item of items) {
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const existing = typeof item.googleCalendarEventId === 'string' ? item.googleCalendarEventId : null;
    const body = shouldHaveEvent(item) ? buildEventBody(item, dateKey, timeZone, artistBySlot) : null;
    if (!body) {
      if (existing && calendarId) await deleteCalendarEvent(calendar, calendarId, existing);
      results.push({ id, calendarEventId: null, changed: existing !== null, created: false });
      continue;
    }
    const calEventId = calendarId ? await upsertCalendarEvent(calendar, calendarId, body, existing) : null;
    // Every pushed item counts as changed (an in-place update keeps its id).
    results.push({ id, calendarEventId: calEventId, changed: calEventId !== null, created: existing === null && calEventId !== null });
  }
  return results;
}

/** Patch only each item's googleCalendarEventId on the FRESH doc (transaction) so a
 * concurrent whole-day client save can't be clobbered. Two idempotency guards mirror
 * the pre-redesign adoption logic: an event we CREATED for an item that meanwhile got
 * one from a concurrent reconcile is ours to delete (theirs stays adopted), and events
 * created for items that vanished mid-reconcile are orphans too. Returns the orphaned
 * calendar ids for best-effort cleanup. */
async function writeBackCalendarIds(
  db: Firestore,
  dayRef: DocumentReference,
  results: readonly ItemResult[],
): Promise<string[]> {
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(dayRef);
    const attached = results.filter((r) => r.calendarEventId !== null);
    if (!fresh.exists) return attached.map((r) => r.calendarEventId!);
    const byId = new Map(results.map((r) => [r.id, r]));
    const orphans: string[] = [];
    const present = new Set<string>();
    const freshItems = Array.isArray(fresh.data()?.items) ? (fresh.data()!.items as DocumentData[]) : [];
    const nextItems = freshItems.map((item) => {
      const id = typeof item.id === 'string' ? item.id : '';
      const result = byId.get(id);
      if (!result) return item;
      present.add(id);
      const current = typeof item.googleCalendarEventId === 'string' ? item.googleCalendarEventId : null;
      if (result.created && current && current !== result.calendarEventId) {
        // A concurrent reconcile already attached an event — adopt it, orphan ours.
        orphans.push(result.calendarEventId!);
        return item;
      }
      return { ...item, googleCalendarEventId: result.calendarEventId };
    });
    tx.update(dayRef, { items: nextItems, updatedAt: FieldValue.serverTimestamp() });
    orphans.push(...attached.filter((r) => !present.has(r.id)).map((r) => r.calendarEventId!));
    return orphans;
  });
}

/**
 * Reconcile one schedule day with the event's Google calendar (admin or event PM).
 * Returns `{ synced, reason?, updated? }` — `reason: 'not_connected'` when the caller
 * has no Google link (a no-op, so saves aren't blocked). Input: { eventId, dayId }.
 */
export const reconcileScheduleDay = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, dayId } = parseCallableData(reconcileScheduleDayInputSchema, request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['reconcileScheduleDay', uid], 60);
  await assertCanEditEvent(db, token, uid, eventId);

  const dayRef = db.doc(`events/${eventId}/scheduleDays/${dayId}`);
  const daySnap = await dayRef.get();
  if (!daySnap.exists) throw new HttpsError('not-found', 'Schedule day not found.');
  const day = daySnap.data() ?? {};
  const items = (Array.isArray(day.items) ? day.items : []) as DocumentData[];

  let client: AuthClient;
  try {
    client = await authedClientForUser(db, uid);
  } catch {
    return { synced: false, reason: 'not_connected' };
  }
  const calendar = google.calendar({ version: 'v3', auth: client });

  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const eventData = eventSnap.data() ?? {};
  const eventTz = typeof eventData.timeZone === 'string' && eventData.timeZone ? eventData.timeZone : TIME_ZONE;

  // Only create the event calendar when something actually needs pushing.
  let calendarId = await readEventCalendarId(db, eventId);
  if (!calendarId && items.some(shouldHaveEvent)) {
    calendarId = await ensureEventCalendar(db, client, uid, eventId, String(eventData.name ?? 'Event'));
  }

  const artistBySlot = await loadSlotArtists(db, eventId, items);
  const results = await reconcileItems(calendar, calendarId, items, String(day.date ?? dayId), eventTz, artistBySlot);
  const orphans = await writeBackCalendarIds(db, dayRef, results);
  for (const orphan of orphans) {
    if (calendarId) await tryDeleteCalendarEvent(calendar, calendarId, orphan);
  }

  return { synced: true, updated: results.filter((r) => r.changed).length };
});

/**
 * Remove a schedule item's calendar event (called by the client just before deleting the
 * item or its day, since the stored id is then gone). Admin or event PM.
 * Input: { eventId, calendarEventId }.
 */
export const removeScheduleCalendarEvent = onCall({ secrets: OAUTH_SECRETS, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, calendarEventId } = parseCallableData(removeScheduleCalendarEventInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['removeScheduleCalendarEvent', uid], 60);
  await assertCanEditEvent(db, token, uid, eventId);

  let client: AuthClient;
  try {
    client = await authedClientForUser(db, uid);
  } catch {
    return { removed: false, reason: 'not_connected' };
  }
  const calendarId = await readEventCalendarId(db, eventId);
  if (calendarId) {
    const calendar = google.calendar({ version: 'v3', auth: client });
    await deleteCalendarEvent(calendar, calendarId, calendarEventId);
  }
  return { removed: true };
});
