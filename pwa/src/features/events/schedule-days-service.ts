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
import { createLogger } from '@/lib/logger';
import { shiftDayKey, zonedDayKey } from '@/lib/dates/timezone';
import type { ScheduleTemplateDay, ScheduleTemplateItem } from '@/lib/schedules/scheduleTemplate';
import {
  matchItemsBySignature,
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

const logger = createLogger('Schedule');

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

/** Delete a day. The doc goes first — deleting a day must never wait on calendar IO
 * (a show day's worth of blocked `removeScheduleCalendarEvent` calls once left show
 * days undeletable while the callable was timing out) — then the pushed items' events
 * are removed in the background, their ids captured from the in-memory day before the
 * doc vanished. Cleanup is best-effort, not durable — closing the tab mid-cleanup can
 * leave events on the calendar (the same exposure a failed callable always had); the
 * durable path is a server-side cascade on day delete (see ISSUES_LOG 2026-08-04). */
export async function deleteScheduleDay(eventId: string, day: ScheduleDay): Promise<void> {
  const items = day.items;
  await deleteDoc(dayDoc(eventId, day.id));
  void removeCalendarEvents(eventId, items);
}

/** How many calendar-event removals go out at once. A show day can hold dozens of
 * pushed items; firing them all concurrently stampedes the callable — every request
 * contends on the same rate-limit doc and the same Google calendar until the platform's
 * request timeout kills them. Small batches keep each request fast. */
const REMOVE_EVENTS_BATCH = 4;

/** Best-effort calendar-event removal for every pushed item in the list, in small
 * sequential batches. Never throws — a failure only means the Google event outlives
 * its schedule row. */
export async function removeCalendarEvents(
  eventId: string,
  items: readonly ScheduleDayItem[],
): Promise<void> {
  const ids = items.map((i) => i.googleCalendarEventId).filter((id): id is string => id !== null);
  let failed = 0;
  for (let at = 0; at < ids.length; at += REMOVE_EVENTS_BATCH) {
    const results = await Promise.allSettled(
      ids.slice(at, at + REMOVE_EVENTS_BATCH).map((id) => removeScheduleCalendarEvent(eventId, id)),
    );
    failed += results.filter((r) => r.status === 'rejected').length;
  }
  if (failed > 0) {
    logger.warn(
      `Could not remove ${failed} calendar event(s); they may remain on the event calendar.`,
    );
  }
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

/** Remove one calendar event. Capture the stored id before deleting the item/day that
 * holds it — the callable only needs the id, not the doc. */
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
    // This is a new document key, so its concurrency history starts at zero.
    revision: 0,
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

/** How an import treats template items that already exist on the target day (same
 * identity signature — type + custom label, start/end, the +1 flag, name, stage):
 * append copies anyway, skip them, or replace the existing rows' content with the
 * template's version. */
export type TemplateImportMode = 'add' | 'skip' | 'replace';

/** Resolve template days against the event's start date: the date key each day lands
 * on, with its items in day-item shape (stages matched by name, fresh ids). */
function resolveTemplateDayDates(
  resolvedDays: readonly ScheduleTemplateDay[],
  eventStart: Date | null,
  timeZone: string,
  stages: readonly { id: string; name: string }[],
): { date: string; day: ScheduleTemplateDay; items: ScheduleDayItem[] }[] {
  if (!eventStart)
    throw new Error('Set the event’s start date before applying a schedule template.');
  const baseKey = zonedDayKey(eventStart, timeZone);
  const stageByName = new Map(stages.map((s) => [s.name.trim().toLowerCase(), s.id]));
  return resolvedDays.map((day) => ({
    date: shiftDayKey(baseKey, day.offset),
    day,
    items: day.items.map((i) => templateItemToDayItem(i, stageByName)),
  }));
}

/** Pre-flight for the import panel: how many of the template's items already exist on
 * the schedule (same date + same identity signature). Decides whether the user gets the
 * add / skip / replace choice before anything is written. */
export async function previewTemplateImport(
  eventId: string,
  resolvedDays: readonly ScheduleTemplateDay[],
  eventStart: Date | null,
  timeZone: string,
  stages: readonly { id: string; name: string }[],
): Promise<{ total: number; duplicates: number }> {
  const targets = resolveTemplateDayDates(resolvedDays, eventStart, timeZone, stages);
  const existing = new Map((await listScheduleDays(eventId)).map((d) => [d.id, d]));
  let total = 0;
  let duplicates = 0;
  for (const { date, items } of targets) {
    total += items.length;
    const current = existing.get(date);
    if (current) duplicates += matchItemsBySignature(current.items, items).matched.length;
  }
  return { total, duplicates };
}

/**
 * Apply resolved template days to an event's schedule (decision 22): a resolved day
 * landing on a date that already has a card merges its items into that card — the
 * event day keeps its own metadata — while new dates get the template day's metadata.
 * Offsets resolve against the event's start date in its timezone (offset 0 = the
 * start date). `mode` says what happens to incoming items that already exist on their
 * target day: 'add' appends copies (the pre-dedupe behavior), 'skip' leaves them out,
 * 'replace' lands the template's content on the matching row — which keeps its id and
 * its server-owned calendar event, so the reconcile updates in place. One atomic batch;
 * returns per-mode counts and the date keys that changed (for calendar reconciles).
 */
export async function applyTemplateDaysToEvent(
  eventId: string,
  resolvedDays: readonly ScheduleTemplateDay[],
  eventStart: Date | null,
  timeZone: string,
  stages: readonly { id: string; name: string }[],
  uid: string,
  mode: TemplateImportMode = 'add',
): Promise<{ added: number; replaced: number; skipped: number; dates: string[] }> {
  const targets = resolveTemplateDayDates(resolvedDays, eventStart, timeZone, stages);
  const existing = new Map((await listScheduleDays(eventId)).map((d) => [d.id, d]));
  const batch = writeBatch(db);
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  const dates: string[] = [];
  for (const { date, day, items } of targets) {
    const current = existing.get(date);
    if (!current) {
      added += items.length;
      dates.push(date);
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
      continue;
    }
    const { fresh, matched } =
      mode === 'add'
        ? { fresh: items, matched: [] as ReturnType<typeof matchItemsBySignature>['matched'] }
        : matchItemsBySignature(current.items, items);
    if (mode === 'skip') skipped += matched.length;
    let dayItems = current.items;
    if (mode === 'replace' && matched.length > 0) {
      const replacement = new Map(
        matched.map(({ existing: row, incoming }) => [
          row.id,
          { ...incoming, id: row.id, googleCalendarEventId: row.googleCalendarEventId },
        ]),
      );
      dayItems = dayItems.map((i) => replacement.get(i.id) ?? i);
      replaced += matched.length;
    }
    added += fresh.length;
    // Nothing landed on this day (everything skipped) — leave its revision untouched.
    if (fresh.length === 0 && !(mode === 'replace' && matched.length > 0)) continue;
    dates.push(date);
    batch.update(dayDoc(eventId, date), {
      items: [...dayItems, ...fresh],
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { added, replaced, skipped, dates };
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
      // Each shifted date is a newly-created document key.
      revision: 0,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
