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
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
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
  return (crew ?? []).map((c) => ({ type: c.type.trim(), quantity: c.quantity, hours: c.hours ?? null }));
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
 * items pass through unchanged, calendar ids included). */
function parsedDayDoc(day: ScheduleDay, date: string) {
  return {
    date,
    dayType: day.dayType,
    title: day.title,
    description: day.description,
    notes: day.notes,
    items: day.items,
  };
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
    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return parsed.date;
}

/** Whole-day save (metadata + items) — the inline editor's save path. The date must be
 * unchanged (re-dating re-keys the doc; use `redateScheduleDay`). */
export async function saveScheduleDay(
  eventId: string,
  day: ScheduleDay,
  input: ScheduleDayInput,
): Promise<void> {
  const parsed = scheduleDayInputSchema.parse(input);
  if (parsed.date !== day.id) throw new Error('Use redateScheduleDay to change a day’s date.');
  await updateDoc(dayDoc(eventId, day.id), {
    ...toDayDoc(parsed, day.items),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScheduleDay(eventId: string, dayId: string): Promise<void> {
  await deleteDoc(dayDoc(eventId, dayId));
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
    await updateDoc(dayDoc(eventId, day.id), { ...fields, updatedAt: serverTimestamp() });
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
 * start date). One atomic batch; returns the number of items added.
 */
export async function applyTemplateDaysToEvent(
  eventId: string,
  resolvedDays: readonly ScheduleTemplateDay[],
  eventStart: Date | null,
  timeZone: string,
  stages: readonly { id: string; name: string }[],
  uid: string,
): Promise<number> {
  if (!eventStart) throw new Error('Set the event’s start date before applying a schedule template.');
  const baseKey = zonedDayKey(eventStart, timeZone);
  const stageByName = new Map(stages.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const existing = new Map((await listScheduleDays(eventId)).map((d) => [d.id, d]));
  const batch = writeBatch(db);
  let added = 0;
  for (const day of resolvedDays) {
    const date = shiftDayKey(baseKey, day.offset);
    const items = day.items.map((i) => templateItemToDayItem(i, stageByName));
    added += items.length;
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
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
  return added;
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
export async function shiftScheduleDays(eventId: string, deltaDays: number, uid: string): Promise<void> {
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
