/**
 * Event/festival document model: `events/{eventId}`. One event holds many
 * advances. Types + Zod schemas + the Firestore parser live together
 * (mirrors src/lib/rbac). Phase 1 created a stub `events` doc for rules tests;
 * this is the real shape.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { APP_TIME_ZONE, dayKeyToInstant, shiftDayKey, zonedDayKey } from '@/lib/dates/timezone';
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
  /** Linked Drive folder for event documents (picked in the event form); null = unlinked. */
  driveFolderId: string | null;
  driveFolderName: string | null;
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
  driveFolderId: z.string().nullable().optional(),
  driveFolderName: z.string().nullable().optional(),
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
    driveFolderId: doc.driveFolderId ?? null,
    driveFolderName: doc.driveFolderName ?? null,
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
    driveFolderId: z.string().nullable().optional(),
    driveFolderName: z.string().nullable().optional(),
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

/** The event's calendar days, start→end inclusive, enumerated in the event's timezone (each is
 *  that day's midnight instant in `timeZone`; capped at 31). Zone-aware so the day list + its keys
 *  match the schedule/advance day keys regardless of the viewer's browser zone (F-6). */
export function eventDays(start: Date | null | undefined, end: Date | null | undefined, timeZone: string): Date[] {
  if (!start) return [];
  const endKey = zonedDayKey(end ?? start, timeZone);
  const days: Date[] = [];
  let key = zonedDayKey(start, timeZone);
  while (key <= endKey && days.length < 31) {
    const instant = dayKeyToInstant(key, timeZone);
    if (instant) days.push(instant);
    key = shiftDayKey(key, 1);
  }
  return days;
}

