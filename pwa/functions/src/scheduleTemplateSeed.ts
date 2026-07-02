/**
 * Seed an event's schedule from referenced schedule templates during create-from-template.
 * Each blueprint item's relative day + wall-clock time resolve against the event's start date
 * IN THE EVENT'S TIMEZONE (DST-aware, via Intl), and stage-tagged items match the new stages by
 * name. The timezone math mirrors pwa/src/lib/dates/timezone.ts (functions shares no client code).
 */
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type { BatchLike } from './lib/db/chunkedBatch.js';
import { shiftDayKey, zonedDayKey, zonedInputToDate } from './lib/dates/zonedTime.js';

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Resolve a blueprint item's relative day + wall-clock time to a UTC instant (null if no time).
 *  `baseKey` is the event start's day (YYYY-MM-DD) in the event zone; offset by whole days. */
function resolveInstant(baseKey: string, dayOffset: number, timeOfDay: unknown, timeZone: string): Date | null {
  if (typeof timeOfDay !== 'string' || !timeOfDay) return null;
  return zonedInputToDate(`${shiftDayKey(baseKey, dayOffset)}T${timeOfDay}`, timeZone);
}

/** Build a `scheduleItems` doc from one blueprint item (times resolved, stage matched by name). */
function toScheduleItemDoc(
  item: DocumentData,
  base: string,
  timeZone: string,
  stageIdByName: Map<string, string>,
  uid: string,
  now: FieldValue,
): DocumentData {
  const dayOffset = typeof item.dayOffset === 'number' ? item.dayOffset : 0;
  const stageName = typeof item.stageName === 'string' ? item.stageName.trim().toLowerCase() : '';
  const startAt = resolveInstant(base, dayOffset, item.timeOfDay, timeZone);
  let endAt = resolveInstant(base, dayOffset, item.endTimeOfDay, timeZone);
  // Overnight blueprint (end time before start time) rolls the end to the next day, so the
  // seeded item has endAt >= startAt (mirrors the client schedule form + applyScheduleTemplate).
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
    endAt = resolveInstant(base, dayOffset + 1, item.endTimeOfDay, timeZone);
  }
  return {
    section: typeof item.section === 'string' ? item.section : 'production',
    customLabel: typeof item.customLabel === 'string' ? item.customLabel : null,
    title: item.title,
    startAt: startAt ? Timestamp.fromDate(startAt) : null,
    endAt: endAt ? Timestamp.fromDate(endAt) : null,
    location: typeof item.location === 'string' ? item.location : null,
    notes: typeof item.notes === 'string' ? item.notes : null,
    stageId: stageName ? (stageIdByName.get(stageName) ?? null) : null,
    slot: typeof item.slot === 'number' ? item.slot : null,
    fields: item.fields && typeof item.fields === 'object' ? item.fields : {},
    includeInMaster: item.includeInMaster !== false,
    order: typeof item.order === 'number' ? item.order : 0,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Read the referenced schedule templates and add their items to the batch as `scheduleItems`
 * under the new event. No-op for missing templates or items without a title.
 */
export async function seedScheduleFromTemplates(
  db: Firestore,
  batch: BatchLike,
  eventRef: DocumentReference,
  scheduleTemplateIds: string[],
  eventStart: Date,
  timeZone: string,
  stageIdByName: Map<string, string>,
  uid: string,
  now: FieldValue,
): Promise<void> {
  const snaps = await Promise.all(
    scheduleTemplateIds.map((id) => db.collection('scheduleTemplates').doc(id).get()),
  );
  const base = zonedDayKey(eventStart, timeZone);
  for (const snap of snaps) {
    if (!snap.exists) continue;
    for (const raw of asArray(snap.data()?.items)) {
      const item = raw as DocumentData;
      if (!item || typeof item.title !== 'string' || !item.title) continue;
      batch.set(eventRef.collection('scheduleItems').doc(), toScheduleItemDoc(item, base, timeZone, stageIdByName, uid, now));
    }
  }
}
