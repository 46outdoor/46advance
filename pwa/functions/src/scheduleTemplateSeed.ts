/**
 * Seed an event's schedule from referenced schedule templates during create-from-template
 * (redesign PR 3). Templates are day-first blueprints: the referenced templates' days
 * merge BY OFFSET (the first template defining an offset owns the day's metadata; later
 * ones only add items — planning/archive/feature/SCHEDULE_REDESIGN.md decision 14) and land as
 * `scheduleDays/{YYYY-MM-DD}` docs, each offset resolved against the event's start date
 * IN THE EVENT'S TIMEZONE. Items keep wall-clock times (no instant math here — that's
 * the calendar push's job); stage-tagged items match the new event's stages by name.
 * Master templates expand their refs one level deep; duplicate refs apply once.
 */
import { randomUUID } from 'node:crypto';
import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type { BatchLike } from './lib/db/chunkedBatch.js';
import { shiftDayKey, zonedDayKey } from './lib/dates/zonedTime.js';

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStringOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const DAY_TYPES = new Set(['travel', 'loadIn', 'show', 'loadOut', 'offDay']);
const ITEM_TYPES = new Set(['production', 'show', 'travel', 'transportation', 'labor', 'custom']);
const WALL_CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const asWallClock = (v: unknown): string | null =>
  typeof v === 'string' && WALL_CLOCK_RE.test(v) ? v : null;

function toCrewLines(raw: unknown): DocumentData[] {
  const lines: DocumentData[] = [];
  for (const entry of asArray(raw)) {
    const line = entry as DocumentData;
    const type = asStringOrNull(line?.type);
    const quantity = typeof line?.quantity === 'number' ? Math.floor(line.quantity) : 0;
    if (!type || quantity < 1) continue;
    lines.push({
      type,
      quantity,
      hours: typeof line.hours === 'number' && line.hours > 0 ? line.hours : null,
    });
  }
  return lines;
}

/** Build one embedded schedule-day item from a blueprint item (fresh id; stage matched
 * by name). Returns null for items without a name. */
function toDayItem(raw: DocumentData, stageIdByName: Map<string, string>): DocumentData | null {
  const name = asStringOrNull(raw.item);
  if (!name) return null;
  const type = typeof raw.type === 'string' && ITEM_TYPES.has(raw.type) ? raw.type : 'production';
  const stageName = asStringOrNull(raw.stageName)?.trim().toLowerCase() ?? '';
  const endTime = asWallClock(raw.endTime);
  return {
    id: randomUUID(),
    type,
    customLabel: type === 'custom' ? asStringOrNull(raw.customLabel) : null,
    startTime: asWallClock(raw.startTime),
    endTime,
    endEstimated: endTime ? raw.endEstimated === true : false,
    item: name,
    description: asStringOrNull(raw.description),
    stageId: stageName ? (stageIdByName.get(stageName) ?? null) : null,
    fields: raw.fields && typeof raw.fields === 'object' ? raw.fields : {},
    crew: toCrewLines(raw.crew),
    pushToCalendar: raw.pushToCalendar !== false,
    googleCalendarEventId: null,
  };
}

/** Fetch the referenced templates, expanding masters one level (standard refs only) and
 * applying each template once even if referenced twice. Returns docs in apply order. */
async function expandTemplates(db: Firestore, ids: string[]): Promise<DocumentData[]> {
  const col = db.collection('scheduleTemplates');
  const seen = new Set<string>();
  const ordered: DocumentData[] = [];
  const firstPass = await Promise.all(ids.map((id) => col.doc(id).get()));
  for (const snap of firstPass) {
    if (!snap.exists || seen.has(snap.id)) continue;
    const data = snap.data() ?? {};
    if (data.kind === 'master') {
      seen.add(snap.id);
      ordered.push(data); // its inline days apply first (they own metadata)
      const refIds = asArray(data.refs).filter(
        (r): r is string => typeof r === 'string' && !seen.has(r),
      );
      const refs = await Promise.all(refIds.map((id) => col.doc(id).get()));
      for (const ref of refs) {
        if (!ref.exists || seen.has(ref.id)) continue;
        const refData = ref.data() ?? {};
        if (refData.kind === 'master') continue; // one level deep
        seen.add(ref.id);
        ordered.push(refData);
      }
    } else {
      seen.add(snap.id);
      ordered.push(data);
    }
  }
  return ordered;
}

interface MergedDay {
  dayType: string;
  title: string | null;
  description: string | null;
  notes: string | null;
  items: DocumentData[];
}

/**
 * Read the referenced schedule templates and add their merged days to the batch as
 * `scheduleDays/{date}` docs under the new event. No-op for missing templates.
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
  const templates = await expandTemplates(db, scheduleTemplateIds);
  const byOffset = new Map<number, MergedDay>();
  for (const tpl of templates) {
    for (const rawDay of asArray(tpl.days)) {
      const day = rawDay as DocumentData;
      if (typeof day?.offset !== 'number' || !Number.isInteger(day.offset)) continue;
      const items = asArray(day.items)
        .map((i) => toDayItem(i as DocumentData, stageIdByName))
        .filter((i): i is DocumentData => i !== null);
      const existing = byOffset.get(day.offset);
      if (existing) {
        existing.items.push(...items);
      } else {
        byOffset.set(day.offset, {
          dayType:
            typeof day.dayType === 'string' && DAY_TYPES.has(day.dayType) ? day.dayType : 'show',
          title: asStringOrNull(day.title),
          description: asStringOrNull(day.description),
          notes: asStringOrNull(day.notes),
          items,
        });
      }
    }
  }
  const baseKey = zonedDayKey(eventStart, timeZone);
  for (const [offset, day] of byOffset) {
    const date = shiftDayKey(baseKey, offset);
    batch.set(eventRef.collection('scheduleDays').doc(date), {
      date,
      dayType: day.dayType,
      title: day.title,
      description: day.description,
      notes: day.notes,
      items: day.items,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
  }
}
