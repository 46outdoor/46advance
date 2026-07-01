/**
 * Event/festival document model: `events/{eventId}`. One event holds many
 * advances. Types + Zod schemas + the Firestore parser live together
 * (mirrors src/lib/rbac). Phase 1 created a stub `events` doc for rules tests;
 * this is the real shape.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { APP_TIME_ZONE, formatZonedDate, shiftDayKey, zonedDayKey, zonedInputToDate } from '@/lib/dates/timezone';
import { logoSchema, parseLogo, type Logo } from '@/lib/branding/logo';

export const EVENT_STATUSES = ['draft', 'active', 'archived'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const eventStatusSchema = z.enum(EVENT_STATUSES);

export interface EventRecord {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  /** Show days are [startDate, endDate]; the schedule also spans this many days before/after. */
  loadInDays: number;
  loadOutDays: number;
  /** IANA timezone for this event's schedule (default Central). */
  timeZone: string;
  venue: string | null;
  status: EventStatus;
  /** Enabled departments (ids) — drive the advance's sections. */
  departmentIds: string[];
  /** Google calendar created for this event (Phase 11b); null until connected + created. */
  googleCalendarId: string | null;
  /**
   * Optional label matching the festival segment in booking titles (e.g. "RTC Ashland"),
   * so Appointment Schedule bookings map to this event during sync (Phase 11b). Null = match
   * by artist name only.
   */
  bookingLabel: string | null;
  /** Readable URL slug (e.g. rtc-ashland-26); the doc id is the fallback. */
  slug: string | null;
  /** Show-specific logo (cloned from the template; overridable per event). */
  eventLogo: Logo | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const eventDocSchema = z.object({
  name: z.string().min(1),
  startDate: z.instanceof(Timestamp).nullable().optional(),
  endDate: z.instanceof(Timestamp).nullable().optional(),
  loadInDays: z.number().int().min(0).optional(),
  loadOutDays: z.number().int().min(0).optional(),
  timeZone: z.string().optional(),
  venue: z.string().nullable().optional(),
  status: eventStatusSchema,
  departmentIds: z.array(z.string()).optional(),
  googleCalendarId: z.string().nullable().optional(),
  bookingLabel: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  eventLogo: logoSchema.nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw event doc. */
export function parseEvent(id: string, data: unknown): EventRecord {
  const doc = eventDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    startDate: timestampToDate(doc.startDate ?? null),
    endDate: timestampToDate(doc.endDate ?? null),
    loadInDays: doc.loadInDays ?? 0,
    loadOutDays: doc.loadOutDays ?? 0,
    timeZone: doc.timeZone ?? APP_TIME_ZONE,
    venue: doc.venue ?? null,
    status: doc.status,
    departmentIds: doc.departmentIds ?? [],
    googleCalendarId: doc.googleCalendarId ?? null,
    bookingLabel: doc.bookingLabel ?? null,
    slug: doc.slug ?? null,
    eventLogo: doc.eventLogo ? parseLogo(doc.eventLogo) : null,
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

/** Client-supplied fields when creating/editing an event. */
export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Event name is required.'),
    startDate: z.date().nullable().optional(),
    endDate: z.date().nullable().optional(),
    loadInDays: z.number().int().min(0).optional(),
    loadOutDays: z.number().int().min(0).optional(),
    timeZone: z.string().optional(),
    venue: z.string().trim().optional(),
    status: eventStatusSchema.optional(),
    departmentIds: z.array(z.string()).optional(),
    bookingLabel: z.string().trim().optional(),
    slug: z.string().trim().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: 'End date must be on or after the start date.', path: ['endDate'] },
  );
export type EventInput = z.infer<typeof eventInputSchema>;

/** The event's calendar days, start→end inclusive (local-midnight Dates; capped at 31). */
export function eventDays(start?: Date | null, end?: Date | null): Date[] {
  if (!start) return [];
  const days: Date[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = end ?? start;
  const stop = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  while (d <= stop && days.length < 31) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export type EventDayKind = 'load-in' | 'show' | 'load-out';

export interface EventScheduleDay {
  /** Midnight (in the event's timezone) instant for the calendar day. */
  date: Date;
  /** Stable `YYYY-MM-DD` key for the day, in the event's timezone (matches `zonedDayKey`). */
  key: string;
  kind: EventDayKind;
  /** e.g. "Mon, Jun 22". */
  dateLabel: string;
  /** e.g. "Mon, Jun 22 · Load-in". */
  label: string;
}

const DAY_KIND_LABELS: Record<EventDayKind, string> = {
  'load-in': 'Load-in',
  show: 'Show',
  'load-out': 'Load-out',
};

/**
 * The event's full operational days — `loadInDays` before the show, the show days, then
 * `loadOutDays` after — each tagged Load-in / Show / Load-out, for the schedule's day picker.
 * Days are derived in the event's `timeZone` (default Central), NOT the browser's zone, so a
 * viewer in another zone still sees the correct calendar days (and the day `key` lines up with
 * `zonedDayKey(item.startAt, timeZone)` used to group items).
 */
export function eventScheduleDays(
  start?: Date | null,
  end?: Date | null,
  loadInDays = 0,
  loadOutDays = 0,
  timeZone: string = APP_TIME_ZONE,
): EventScheduleDay[] {
  if (!start) return [];
  const showEnd = end ?? start;
  const showStartKey = zonedDayKey(start, timeZone);
  const showEndKey = zonedDayKey(showEnd, timeZone);
  const firstKey = shiftDayKey(showStartKey, -Math.max(0, loadInDays));
  const lastKey = shiftDayKey(showEndKey, Math.max(0, loadOutDays));

  const days: EventScheduleDay[] = [];
  let key = firstKey;
  // `YYYY-MM-DD` keys are zero-padded, so lexical string comparison is date order.
  while (key <= lastKey && days.length < 60) {
    const kind: EventDayKind = key < showStartKey ? 'load-in' : key > showEndKey ? 'load-out' : 'show';
    const date = zonedInputToDate(`${key}T00:00`, timeZone) ?? start;
    const dateLabel = formatZonedDate(date, timeZone);
    days.push({ date, key, kind, dateLabel, label: `${dateLabel} · ${DAY_KIND_LABELS[kind]}` });
    key = shiftDayKey(key, 1);
  }
  return days;
}
