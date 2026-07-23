/**
 * Schedule-day data access (`events/{e}/scheduleDays/{YYYY-MM-DD}`, redesign PR 2).
 * The doc id IS the date key — one card per date, enforced by rules and the parser —
 * so date changes re-key the doc (redate/shift are atomic delete+create batches).
 * Writes are whole-day (the day owns its embedded items); per-item
 * `googleCalendarEventId` is server-owned, so saves carry existing ids across by item
 * id. The calendar reconcile itself is the push callable's job (redesign PR 4).
 * Reads/writes gated by firestore.rules (member read; PM/admin write).
 */
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  ReconcileScheduleDayInput,
  ReconcileScheduleDayOutput,
  RemoveScheduleCalendarEventInput,
  RemoveScheduleCalendarEventOutput,
} from '@contracts/callables/schedules';
import { db, functions } from '@/services/firebase';
import { shiftDayKey, zonedDayKey } from '@/lib/dates/timezone';
import type { ScheduleTemplateDay, ScheduleTemplateItem } from '@/lib/schedules/scheduleTemplate';
import {
  parseScheduleDay,
  scheduleDayInputSchema,
  scheduleDayMetaSchema,
  type CrewLine,
  type ScheduleDay,
  type ScheduleDayInput,
  type ScheduleDayItem,
  type ScheduleDayItemInput,
  type ScheduleDayMeta,
} from '@/lib/schedules/scheduleDay';

function daysCol(eventId: string) {
  return collection(db, 'events', eventId, 'scheduleDays');
}
function dayDoc(eventId: string, dayId: string) {
  return doc(db, 'events', eventId, 'scheduleDays', dayId);
}

/** All schedule days for an event, sorted by date. */
export async function listScheduleDays(eventId: string): Promise<ScheduleDay[]> {
  const snap = await getDocs(daysCol(eventId));
  return snap.docs
    .map((d) => parseScheduleDay(d.id, d.data()))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toCrewDocs(
  crew: readonly { type: string; quantity: number; hours?: number | null }[] | undefined,
): CrewLine[] {
  return (crew ?? []).map((c) => ({
    type: c.type.trim(),
    quantity: c.quantity,
    hours: c.hours ?? null,
  }));
}

/** Input items → stored shape, carrying server-owned calendar ids from `existing` by item id. */
function toItemDocs(
  items: readonly ScheduleDayItemInput[] | undefined,
  existing: readonly ScheduleDayItem[],
): ScheduleDayItem[] {
  const calendarId = new Map(existing.map((i) => [i.id, i.googleCalendarEventId]));
  return (items ?? []).map((i) => ({
    id: i.id,
    type: i.type,
    customLabel: i.type === 'custom' ? i.customLabel?.trim() || null : null,
    startTime: i.startTime ?? null,
    endTime: i.endTime ?? null,
    endEstimated: i.endTime ? (i.endEstimated ?? false) : false,
    nextDay: i.startTime || i.endTime ? (i.nextDay ?? false) : false,
    item: i.item.trim(),
    description: i.description?.trim() || null,
    stageId: i.stageId?.trim() || null,
    fields: i.fields ?? {},
    crew: toCrewDocs(i.crew),
    pushToCalendar: i.pushToCalendar ?? true,
    googleCalendarEventId: calendarId.get(i.id) ?? null,
  }));
}

function toDayDoc(input: ScheduleDayInput, existingItems: readonly ScheduleDayItem[]) {
  return {
    date: input.date,
    dayType: input.dayType,
    title: input.title?.trim() || null,
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    items: toItemDocs(input.items, existingItems),
  };
}

/** A parsed day serialized back to its doc shape under `date` (redate/shift carry-over —
 * items pass through unchanged, calendar ids included; the revision counter travels with it). */
function parsedDayDoc(day: ScheduleDay, date: string) {
  return {
    date,
    dayType: day.dayType,
    title: day.title,
    description: day.description,
    notes: day.notes,
    items: day.items,
    revision: day.revision,
  };
}

/** Thrown when a whole-day save loses the optimistic-concurrency check — the day was changed
 * (or deleted) by someone else since it was loaded. The UI refetches and asks the user to
 * reapply, rather than silently clobbering the other edit (WS-G). */
export class ScheduleDayConflictError extends Error {
  constructor(
    message = 'This schedule day changed since you opened it. Your view has been refreshed — reapply your edit.',
  ) {
    super(message);
    this.name = 'ScheduleDayConflictError';
  }
}

/** Whole-day update guarded by the `revision` counter: reads the fresh doc in a transaction,
 * aborts (ScheduleDayConflictError) if its revision moved since `day` was loaded, otherwise
 * writes `buildFields(fresh)` with `revision + 1`. `buildFields` receives the FRESH day so a
 * content save can carry server-owned per-item calendar ids the reconcile may have written
 * since load (those aren't a user conflict — only the user-editable fields are guarded). */
async function updateDayWithRevision(
  eventId: string,
  day: ScheduleDay,
  buildFields: (fresh: ScheduleDay) => Record<string, unknown>,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = dayDoc(eventId, day.id);
    const snap = await tx.get(ref);
    if (!snap.exists)
      throw new ScheduleDayConflictError('This schedule day no longer exists — it was deleted.');
    const fresh = parseScheduleDay(snap.id, snap.data());
    if (fresh.revision !== day.revision) throw new ScheduleDayConflictError();
    tx.update(ref, {
      ...buildFields(fresh),
      revision: fresh.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Editable input snapshot of a parsed day (drops the server-owned per-item calendar
 * ids — `saveScheduleDay` carries them back across by item id). */
export function dayToInput(day: ScheduleDay): ScheduleDayInput {
  return {
    date: day.date,
    dayType: day.dayType,
    title: day.title ?? undefined,
    description: day.description ?? undefined,
    notes: day.notes ?? undefined,
    items: day.items.map((i) => ({
      id: i.id,
      type: i.type,
      customLabel: i.customLabel ?? undefined,
      startTime: i.startTime,
      endTime: i.endTime,
      endEstimated: i.endEstimated,
      nextDay: i.nextDay,
      item: i.item,
      description: i.description ?? undefined,
      stageId: i.stageId ?? undefined,
      fields: i.fields,
      crew: i.crew,
      pushToCalendar: i.pushToCalendar,
    })),
  };
}

/** Create a day; the doc id is the date. Throws if that date already has a card. */
export async function createScheduleDay(
  eventId: string,
  input: ScheduleDayInput,
  creatorUid: string,
): Promise<string> {
  const parsed = scheduleDayInputSchema.parse(input);
  const ref = dayDoc(eventId, parsed.date);
  const existing = await getDoc(ref);
  if (existing.exists()) throw new Error('That date already has a schedule day.');
  await setDoc(ref, {
    ...toDayDoc(parsed, []),
    revision: 0,
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return parsed.date;
}

/** Whole-day save (metadata + items) — the inline editor's save path. The date must be
 * unchanged (re-dating re-keys the doc; use `saveScheduleDayMeta`). Guarded by the day's
 * `revision` (WS-G): if another editor (or a redate) changed the day since it was loaded, the
 * save aborts with `ScheduleDayConflictError` instead of overwriting their items. Server-owned
 * per-item calendar ids are carried from the FRESH doc, so a concurrent reconcile isn't
 * reverted. */
export async function saveScheduleDay(
  eventId: string,
  day: ScheduleDay,
  input: ScheduleDayInput,
): Promise<void> {
  const parsed = scheduleDayInputSchema.parse(input);
  if (parsed.date !== day.id) throw new Error('Use saveScheduleDayMeta to change a day’s date.');
  await updateDayWithRevision(eventId, day, (fresh) => toDayDoc(parsed, fresh.items));
}

/** Delete a day, removing its pushed items' calendar events first (their stored ids are
 * gone once the doc is). Calendar removal is best-effort — a failure never blocks the
 * delete. */
export async function deleteScheduleDay(eventId: string, day: ScheduleDay): Promise<void> {
  await removeCalendarEvents(eventId, day.items);
  await deleteDoc(dayDoc(eventId, day.id));
}

/** Best-effort calendar-event removal for every pushed item in the list. */
export async function removeCalendarEvents(
  eventId: string,
  items: readonly ScheduleDayItem[],
): Promise<void> {
  const ids = items.map((i) => i.googleCalendarEventId).filter((id): id is string => id !== null);
  await Promise.allSettled(ids.map((id) => removeScheduleCalendarEvent(eventId, id)));
}

/** Reconcile one day with the event's Google calendar (fire after day saves; redesign
 * PR 4). Returns `{ synced:false, reason:'not_connected' }` as a no-op when the caller
 * hasn't linked Google — never block a save on it. */
export async function reconcileScheduleDayCalendar(
  eventId: string,
  dayId: string,
): Promise<ReconcileScheduleDayOutput> {
  const callable = httpsCallable<ReconcileScheduleDayInput, ReconcileScheduleDayOutput>(
    functions,
    'reconcileScheduleDay',
  );
  return (await callable({ eventId, dayId })).data;
}

/** Remove one calendar event — call BEFORE deleting the item/day that stores its id. */
export async function removeScheduleCalendarEvent(
  eventId: string,
  calendarEventId: string,
): Promise<void> {
  const callable = httpsCallable<
    RemoveScheduleCalendarEventInput,
    RemoveScheduleCalendarEventOutput
  >(functions, 'removeScheduleCalendarEvent');
  await callable({ eventId, calendarEventId });
}

/** Save a day's metadata (dayType/title/description/notes — the day form's slice).
 * A date change re-keys the doc: one atomic batch deletes the old key and re-creates
 * under the new one with the new metadata and the items (calendar ids included)
 * carried across — no window where the day exists half-moved. The re-created doc's
 * `createdBy` becomes the caller (rules pin it on create); PR 4's reconcile re-times
 * pushed items. Returns the day's (possibly new) id. */
export async function saveScheduleDayMeta(
  eventId: string,
  day: ScheduleDay,
  meta: ScheduleDayMeta,
  uid: string,
): Promise<string> {
  const parsed = scheduleDayMetaSchema.parse(meta);
  const fields = {
    dayType: parsed.dayType,
    title: parsed.title?.trim() || null,
    description: parsed.description?.trim() || null,
    notes: parsed.notes?.trim() || null,
  };
  if (parsed.date === day.id) {
    // Same-date metadata edit rides the same revision guard as a content save, so a concurrent
    // whole-day save can't silently lose one or the other's fields.
    await updateDayWithRevision(eventId, day, () => fields);
    return day.id;
  }
  const target = dayDoc(eventId, parsed.date);
  const existing = await getDoc(target);
  if (existing.exists()) throw new Error('That date already has a schedule day.');
  const batch = writeBatch(db);
  batch.delete(dayDoc(eventId, day.id));
  batch.set(target, {
    ...parsedDayDoc(day, parsed.date),
    ...fields,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return parsed.date;
}

/** A template item landing in an event day: stage matched to the event's stages by
 * name (case-insensitive), a fresh id (re-applying a template must not collide with
 * items it created before), and no calendar event yet. */
function templateItemToDayItem(
  item: ScheduleTemplateItem,
  stageByName: ReadonlyMap<string, string>,
): ScheduleDayItem {
  const { stageName, ...rest } = item;
  return {
    ...rest,
    id: crypto.randomUUID(),
    stageId: stageName ? (stageByName.get(stageName.trim().toLowerCase()) ?? null) : null,
    googleCalendarEventId: null,
  };
}

/**
 * Apply resolved template days to an event's schedule (decision 22): a resolved day
 * landing on a date that already has a card merges its items into that card — the
 * event day keeps its own metadata — while new dates get the template day's metadata.
 * Offsets resolve against the event's start date in its timezone (offset 0 = the
 * start date). One atomic batch; returns the item count and the affected date keys
 * (so the caller can fire calendar reconciles for them).
 */
export async function applyTemplateDaysToEvent(
  eventId: string,
  resolvedDays: readonly ScheduleTemplateDay[],
  eventStart: Date | null,
  timeZone: string,
  stages: readonly { id: string; name: string }[],
  uid: string,
): Promise<{ added: number; dates: string[] }> {
  if (!eventStart)
    throw new Error('Set the event’s start date before applying a schedule template.');
  const baseKey = zonedDayKey(eventStart, timeZone);
  const stageByName = new Map(stages.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const existing = new Map((await listScheduleDays(eventId)).map((d) => [d.id, d]));
  const batch = writeBatch(db);
  let added = 0;
  const dates: string[] = [];
  for (const day of resolvedDays) {
    const date = shiftDayKey(baseKey, day.offset);
    const items = day.items.map((i) => templateItemToDayItem(i, stageByName));
    added += items.length;
    dates.push(date);
    const current = existing.get(date);
    if (current) {
      batch.update(dayDoc(eventId, date), {
        items: [...current.items, ...items],
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(dayDoc(eventId, date), {
        date,
        dayType: day.dayType,
        title: day.title,
        description: day.description,
        notes: day.notes,
        items,
        revision: 0,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
  return { added, dates };
}

/** Firestore caps a batch at 500 writes; each shifted day costs a delete + a set (plus
 * transforms). Chunking would break atomicity, so cap instead — far above any real
 * event schedule. */
const MAX_SHIFT_DAYS = 100;

/** Shift every day by `deltaDays` (the event slipped). Reads the event's canonical day
 * set inside the operation — a stale caller list must not overwrite unmoved days. All
 * days move together, so relative spacing — and per-date uniqueness — is preserved.
 * One atomic batch: deletes first, then re-creates under the shifted keys (a shifted
 * key landing on another day's old key is fine — the set wins within the batch). */
export async function shiftScheduleDays(
  eventId: string,
  deltaDays: number,
  uid: string,
): Promise<void> {
  if (deltaDays === 0) return;
  const days = await listScheduleDays(eventId);
  if (days.length === 0) return;
  if (days.length > MAX_SHIFT_DAYS) {
    throw new Error(`Cannot shift more than ${MAX_SHIFT_DAYS} days in one step.`);
  }
  const batch = writeBatch(db);
  for (const day of days) batch.delete(dayDoc(eventId, day.id));
  for (const day of days) {
    const newDate = shiftDayKey(day.date, deltaDays);
    batch.set(dayDoc(eventId, newDate), {
      ...parsedDayDoc(day, newDate),
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
