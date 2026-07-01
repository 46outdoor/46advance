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
  type WriteBatch,
} from 'firebase-admin/firestore';

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Offset (ms) of `timeZone` from UTC at `at` (DST-aware). */
function tzOffsetMillis(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) if (p.type !== 'literal') map[p.type] = Number(p.value);
  const hour = map.hour % 24;
  const wallAsUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return wallAsUtc - at.getTime();
}

/** Parse a 'YYYY-MM-DDTHH:mm' wall-clock string interpreted in `timeZone` to a UTC Date. */
function zonedInputToDate(value: string, timeZone: string): Date | null {
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMillis(timeZone, new Date(guess));
  let utc = guess - off1;
  const off2 = tzOffsetMillis(timeZone, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** {y, m, d} of `instant` as seen in `timeZone`. */
function zonedYmd(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) if (p.type !== 'literal') map[p.type] = Number(p.value);
  return { y: map.year, m: map.month, d: map.day };
}

/** Resolve a blueprint item's relative day + wall-clock time to a UTC instant (null if no time). */
function resolveInstant(
  base: { y: number; m: number; d: number },
  dayOffset: number,
  timeOfDay: unknown,
  timeZone: string,
): Date | null {
  if (typeof timeOfDay !== 'string' || !timeOfDay) return null;
  const day = new Date(Date.UTC(base.y, base.m - 1, base.d + dayOffset));
  const dateStr = `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
  return zonedInputToDate(`${dateStr}T${timeOfDay}`, timeZone);
}

/** Build a `scheduleItems` doc from one blueprint item (times resolved, stage matched by name). */
function toScheduleItemDoc(
  item: DocumentData,
  base: { y: number; m: number; d: number },
  timeZone: string,
  stageIdByName: Map<string, string>,
  uid: string,
  now: FieldValue,
): DocumentData {
  const dayOffset = typeof item.dayOffset === 'number' ? item.dayOffset : 0;
  const stageName = typeof item.stageName === 'string' ? item.stageName.trim().toLowerCase() : '';
  const startAt = resolveInstant(base, dayOffset, item.timeOfDay, timeZone);
  const endAt = resolveInstant(base, dayOffset, item.endTimeOfDay, timeZone);
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
  batch: WriteBatch,
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
  const base = zonedYmd(eventStart, timeZone);
  for (const snap of snaps) {
    if (!snap.exists) continue;
    for (const raw of asArray(snap.data()?.items)) {
      const item = raw as DocumentData;
      if (!item || typeof item.title !== 'string' || !item.title) continue;
      batch.set(eventRef.collection('scheduleItems').doc(), toScheduleItemDoc(item, base, timeZone, stageIdByName, uid, now));
    }
  }
}
