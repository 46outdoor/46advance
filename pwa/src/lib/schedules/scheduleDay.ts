/**
 * Schedule day model (planning/archive/feature/SCHEDULE_REDESIGN.md): `events/{eventId}/scheduleDays/{dayKey}`.
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
const ARTIST_PLACEHOLDER_RE = /\{artist(?:[\s_]+([a-z]))?[\s_]+(\d+)\}/gi;

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
  /** "+1": the times are the AM after this day's date (a post-show reset or late-night
   * load out stays grouped with its work day). Sorts after the same-day rows; calendar
   * push shifts the instants one date forward. */
  nextDay: boolean;
  /** The Item column (row name); may contain `{artist_N}` / `{artist_b_N}`
   * placeholders (Show) — see resolveArtistPlaceholders. */
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
  /** Monotonic optimistic-concurrency counter (WS-G). A whole-day save reads this, aborts if it
   *  moved, and writes `revision + 1` — so two editors saving the same day can't silently clobber
   *  each other's items. Absent on pre-S12 docs → treated as 0. */
  revision: number;
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

/** Exported for the template model, which derives its item shape from this one
 * (stage by name instead of id; no server-owned calendar field). */
export const scheduleDayItemDocSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SCHEDULE_ITEM_TYPE_KEYS),
  customLabel: z.string().nullable().optional(),
  startTime: wallClockSchema.nullable().optional(),
  endTime: wallClockSchema.nullable().optional(),
  endEstimated: z.boolean().optional(),
  nextDay: z.boolean().optional(),
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
  items: z.array(scheduleDayItemDocSchema).optional(),
  revision: z.number().int().nonnegative().optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

function parseItem(raw: z.infer<typeof scheduleDayItemDocSchema>): ScheduleDayItem {
  return {
    id: raw.id,
    type: raw.type,
    customLabel: raw.customLabel ?? null,
    startTime: raw.startTime ?? null,
    endTime: raw.endTime ?? null,
    endEstimated: raw.endEstimated ?? false,
    nextDay: raw.nextDay ?? false,
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
    revision: doc.revision ?? 0,
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
  nextDay: z.boolean().optional(),
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

/** Display order for a day's rows: by start time — "+1" (next-day AM) rows after every
 * same-day time, untimed last; ties keep the array (authoring) order —
 * Array.prototype.sort is stable. */
export function sortDayItems<T extends { startTime: string | null; nextDay?: boolean }>(
  items: readonly T[],
): T[] {
  // Lexicographic sort key: '1' same-day times < '2' next-day times < '3' untimed.
  const key = (i: T) => (i.startTime == null ? '3' : `${i.nextDay ? 2 : 1}${i.startTime}`);
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

/** The identity slice of a row for duplicate detection when a template is imported onto
 * a schedule that already has rows: what the row IS — type (+ custom label), times, name,
 * stage — not its free-text details (description / fields / crew), which a replace-mode
 * import is allowed to update. */
export type ScheduleItemIdentity = Pick<
  ScheduleDayItem,
  'type' | 'customLabel' | 'startTime' | 'endTime' | 'nextDay' | 'item' | 'stageId'
>;

/** Name/label normalization for signature comparison: trimmed, case-insensitive,
 * whitespace runs collapsed. */
const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Content signature over the identity slice. Names and custom labels compare
 * normalized; the custom label counts only for custom-type rows (it's normalized away
 * on non-custom rows at save time). JSON-encoded so free-text fields can't collide
 * with the tuple structure. */
export function dayItemSignature(i: ScheduleItemIdentity): string {
  return JSON.stringify([
    i.type,
    i.type === 'custom' ? normalizeName(i.customLabel ?? '') : '',
    i.startTime,
    i.endTime,
    i.nextDay,
    normalizeName(i.item),
    i.stageId,
  ]);
}

/** Match `incoming` rows one-to-one against `existing` rows with the same signature —
 * each existing row is claimed at most once, so two identical incoming rows against one
 * existing row yield one match and one fresh. Returns the unmatched incoming rows
 * (`fresh`) and the matched pairs, both in incoming order. */
export function matchItemsBySignature(
  existing: readonly ScheduleDayItem[],
  incoming: readonly ScheduleDayItem[],
): {
  fresh: ScheduleDayItem[];
  matched: { existing: ScheduleDayItem; incoming: ScheduleDayItem }[];
} {
  const unclaimed = new Map<string, ScheduleDayItem[]>();
  for (const item of existing) {
    const sig = dayItemSignature(item);
    const queue = unclaimed.get(sig);
    if (queue) queue.push(item);
    else unclaimed.set(sig, [item]);
  }
  const fresh: ScheduleDayItem[] = [];
  const matched: { existing: ScheduleDayItem; incoming: ScheduleDayItem }[] = [];
  for (const item of incoming) {
    const claimed = unclaimed.get(dayItemSignature(item))?.shift();
    if (claimed) matched.push({ existing: claimed, incoming: item });
    else fresh.push(item);
  }
  return { fresh, matched };
}

/** Replace artist placeholders in item text. A placeholder names its lineup stage by
 * order: `{artist_N}` (or legacy `{artist N}`) is slot N on the FIRST stage — the main
 * stage — `{artist_b_N}` slot N on the second (side) stage, `{artist_c_N}` the third,
 * and so on. The row's own stage never affects resolution. `resolve` maps
 * (stageIndex, slot) to the artist holding that slot; unresolved (or blank) slots
 * render the lineup slot label — "Headliner" / "Direct Support" / "Artist N" — until
 * an act is booked, matching how unassigned slots display everywhere else. */
export function resolveArtistPlaceholders(
  text: string,
  resolve: (stageIndex: number, slot: number) => string | null,
): string {
  return text.replace(ARTIST_PLACEHOLDER_RE, (_match, letter: string | undefined, n: string) => {
    const stageIndex = letter ? letter.toLowerCase().charCodeAt(0) - 97 : 0;
    return resolve(stageIndex, Number(n)) || slotLabel(Number(n));
  });
}
