/**
 * Schedule day model (planning/SCHEDULE_REDESIGN.md): `events/{eventId}/scheduleDays/{dayKey}`.
 * One doc per calendar day — the doc id IS the date key (`YYYY-MM-DD` in the event's
 * timezone), making one-card-per-date structural. The day owns its items as an embedded
 * array (a day's schedule sits far under the 1 MB doc cap and saves atomically); array
 * position is the tie-break for equal start times, so items carry no order field. Items
 * store wall-clock times — UTC instants are derived (day date + time in the event's
 * timezone) only at calendar-push/export time.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { spanMinutes } from '@/lib/dates/calculations';
import { formatMinutes } from '@/lib/dates/formatting';
import { isValidDateKey } from '@/lib/dates/parsing';
import { slotLabel } from '@/lib/advances/advance';
import { SCHEDULE_DAY_TYPE_KEYS, type ScheduleDayType } from './dayTypes';
import { SCHEDULE_ITEM_TYPE_KEYS, scheduleItemTypeDef, type ScheduleItemType } from './itemTypes';

const WALL_CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ARTIST_PLACEHOLDER_RE = /\{artist\s+(\d+)\}/gi;

const dateKeySchema = z.string().refine(isValidDateKey, 'Use a real YYYY-MM-DD date.');
const wallClockSchema = z.string().regex(WALL_CLOCK_RE, 'Use a HH:mm time.');

/** One labor crew line: "(12) Stagehands · 8h". `hours` is this type's call length,
 * independent of the item's overall start/end window. */
export interface CrewLine {
  type: string;
  quantity: number;
  hours: number | null;
}

/** One grid row of a schedule day. `item` is the row's name column; `fields` holds the
 * type's flat detail fields (itemTypes.ts); `crew` applies to labor items only. */
export interface ScheduleDayItem {
  id: string;
  type: ScheduleItemType;
  /** Type display name when type === 'custom'. */
  customLabel: string | null;
  /** 'HH:mm' wall-clock in the event's timezone; null = untimed. */
  startTime: string | null;
  /** 'HH:mm' wall-clock end; earlier than start = wraps overnight. */
  endTime: string | null;
  /** The end time is an estimate (labor grids' "Est End Time"). */
  endEstimated: boolean;
  /** The Item column (row name); may contain `{artist N}` placeholders (Show). */
  item: string;
  description: string | null;
  /** Stage sub-type; null = event-wide. */
  stageId: string | null;
  fields: Record<string, string>;
  crew: CrewLine[];
  /** Sync this item to the event's Google calendar (defaults on). */
  pushToCalendar: boolean;
  /** Calendar event created by the push reconcile (server-written); null otherwise. */
  googleCalendarEventId: string | null;
}

export interface ScheduleDay {
  id: string;
  /** 'YYYY-MM-DD' in the event's timezone — always equals the doc id. */
  date: string;
  dayType: ScheduleDayType;
  title: string | null;
  description: string | null;
  notes: string | null;
  items: ScheduleDayItem[];
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Doc schemas mirror the input constraints: there is no legacy schedule data, the rules
// can't reach fields inside the embedded items array, and any future non-client writer
// (seeds, template apply) should fail loudly on malformed times/quantities rather than
// render blank durations or "(0)" crew lines.
const crewLineDocSchema = z.object({
  type: z.string().min(1),
  quantity: z.number().int().positive(),
  hours: z.number().positive().nullable().optional(),
});

const itemDocSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SCHEDULE_ITEM_TYPE_KEYS),
  customLabel: z.string().nullable().optional(),
  startTime: wallClockSchema.nullable().optional(),
  endTime: wallClockSchema.nullable().optional(),
  endEstimated: z.boolean().optional(),
  item: z.string().min(1),
  description: z.string().nullable().optional(),
  stageId: z.string().nullable().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  crew: z.array(crewLineDocSchema).optional(),
  pushToCalendar: z.boolean().optional(),
  googleCalendarEventId: z.string().nullable().optional(),
});

const dayDocSchema = z.object({
  date: dateKeySchema,
  dayType: z.enum(SCHEDULE_DAY_TYPE_KEYS),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(itemDocSchema).optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

function parseItem(raw: z.infer<typeof itemDocSchema>): ScheduleDayItem {
  return {
    id: raw.id,
    type: raw.type,
    customLabel: raw.customLabel ?? null,
    startTime: raw.startTime ?? null,
    endTime: raw.endTime ?? null,
    endEstimated: raw.endEstimated ?? false,
    item: raw.item,
    description: raw.description ?? null,
    stageId: raw.stageId ?? null,
    fields: raw.fields ?? {},
    crew: (raw.crew ?? []).map((c) => ({ type: c.type, quantity: c.quantity, hours: c.hours ?? null })),
    pushToCalendar: raw.pushToCalendar ?? true,
    googleCalendarEventId: raw.googleCalendarEventId ?? null,
  };
}

/** Validate + normalize a raw schedule-day doc. Enforces the structural invariant
 * that the doc id IS the stored date (one card per date). Preserves item array order
 * (the authoring order — display sorting is `sortDayItems`). */
export function parseScheduleDay(id: string, data: unknown): ScheduleDay {
  const doc = dayDocSchema.parse(data);
  if (doc.date !== id) {
    throw new Error(`Schedule-day id "${id}" must equal its date "${doc.date}".`);
  }
  return {
    id,
    date: doc.date,
    dayType: doc.dayType,
    title: doc.title ?? null,
    description: doc.description ?? null,
    notes: doc.notes ?? null,
    items: (doc.items ?? []).map(parseItem),
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const crewLineInputSchema = z.object({
  type: z.string().trim().min(1, 'Crew type is required.'),
  quantity: z.number().int().positive('Quantity must be a positive number.'),
  hours: z.number().positive().nullable().optional(),
});

/** Client-supplied fields for one item row (id is client-generated for embedded rows). */
export const scheduleDayItemInputSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SCHEDULE_ITEM_TYPE_KEYS),
  customLabel: z.string().trim().optional(),
  startTime: wallClockSchema.nullable().optional(),
  endTime: wallClockSchema.nullable().optional(),
  endEstimated: z.boolean().optional(),
  item: z.string().trim().min(1, 'Item is required.'),
  description: z.string().trim().optional(),
  stageId: z.string().trim().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  crew: z.array(crewLineInputSchema).optional(),
  pushToCalendar: z.boolean().optional(),
});
export type ScheduleDayItemInput = z.infer<typeof scheduleDayItemInputSchema>;

/** Client-supplied fields when creating/editing a day (items travel with the day doc). */
export const scheduleDayInputSchema = z.object({
  date: dateKeySchema,
  dayType: z.enum(SCHEDULE_DAY_TYPE_KEYS),
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(scheduleDayItemInputSchema).optional(),
});
export type ScheduleDayInput = z.infer<typeof scheduleDayInputSchema>;

/** The day form's slice of the input — metadata only; items stay with the grid. */
export const scheduleDayMetaSchema = scheduleDayInputSchema.omit({ items: true });
export type ScheduleDayMeta = z.infer<typeof scheduleDayMetaSchema>;

/** The Duration column for one item, or null to leave it blank. Crew-bearing items show
 * a duration only when every line agrees on one (decision 17 — differing per-line
 * durations make a single number misleading). A line without hours runs the item's own
 * window (a call line with no stated duration means the full call), so it compares by
 * that value. Everything else derives from start/end. */
export function itemDurationLabel(
  item: Pick<ScheduleDayItem, 'type' | 'startTime' | 'endTime' | 'crew'>,
): string | null {
  const span = spanMinutes(item.startTime, item.endTime);
  if (scheduleItemTypeDef(item.type).hasCrew && item.crew.length > 0) {
    const durations = item.crew.map((line) => (line.hours == null ? span : line.hours * 60));
    const shared = durations[0];
    if (shared == null || durations.some((d) => d !== shared)) return null;
    return formatMinutes(shared);
  }
  return span == null ? null : formatMinutes(span);
}

/** Display order for a day's rows: by start time, untimed last; equal times keep the
 * array (authoring) order — Array.prototype.sort is stable. */
export function sortDayItems<T extends { startTime: string | null }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.startTime === b.startTime) return 0;
    if (a.startTime == null) return 1;
    if (b.startTime == null) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
}

/** Replace `{artist N}` placeholders in item text. `resolve` maps a slot number to the
 * artist holding it on the item's stage; unresolved (or blank) slots render the lineup
 * slot label — "Headliner" / "Direct Support" / "Artist N" — until an act is booked,
 * matching how unassigned slots display everywhere else. */
export function resolveArtistPlaceholders(text: string, resolve: (slot: number) => string | null): string {
  return text.replace(ARTIST_PLACEHOLDER_RE, (_match, n: string) => resolve(Number(n)) || slotLabel(Number(n)));
}
