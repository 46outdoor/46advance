/**
 * Schedule item model (Phase 12a): `events/{eventId}/scheduleItems/{itemId}`. One timed item
 * in an event's schedule, tagged by section (sections.ts) with an optional stage. Common fields
 * live here; section-specific values live in `fields`. Times are UTC instants — render/enter in
 * Central via `src/lib/dates/timezone.ts`. Master schedule = aggregate of items with
 * `includeInMaster`, grouped by Central day.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { SCHEDULE_SECTION_KEYS, type ScheduleSection } from './sections';

const sectionEnum = z.enum(SCHEDULE_SECTION_KEYS);

export interface ScheduleItem {
  id: string;
  section: ScheduleSection;
  /** Section display name when section === 'custom'. */
  customLabel: string | null;
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  location: string | null;
  notes: string | null;
  /** Optional stage tag (stage-specific items like soundcheck/set); null = event-wide. */
  stageId: string | null;
  /** Optional advance/act link (Show section) — legacy; superseded by `slot`. */
  advanceId: string | null;
  /** Lineup slot for a Show item: resolves to the artist holding that slot on `stageId`. */
  slot: number | null;
  /** Section-specific field values (sections.ts). */
  fields: Record<string, string>;
  includeInMaster: boolean;
  /** Calendar event created when pushed to the event's Google calendar (12b); null otherwise. */
  googleCalendarEventId: string | null;
  order: number;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const scheduleItemDocSchema = z.object({
  section: sectionEnum,
  customLabel: z.string().nullable().optional(),
  title: z.string().min(1),
  startAt: z.instanceof(Timestamp).nullable().optional(),
  endAt: z.instanceof(Timestamp).nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  stageId: z.string().nullable().optional(),
  advanceId: z.string().nullable().optional(),
  slot: z.number().nullable().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  includeInMaster: z.boolean().optional(),
  googleCalendarEventId: z.string().nullable().optional(),
  order: z.number().optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw schedule-item doc. */
export function parseScheduleItem(id: string, data: unknown): ScheduleItem {
  const doc = scheduleItemDocSchema.parse(data);
  return {
    id,
    section: doc.section,
    customLabel: doc.customLabel ?? null,
    title: doc.title,
    startAt: timestampToDate(doc.startAt ?? null),
    endAt: timestampToDate(doc.endAt ?? null),
    location: doc.location ?? null,
    notes: doc.notes ?? null,
    stageId: doc.stageId ?? null,
    advanceId: doc.advanceId ?? null,
    slot: doc.slot ?? null,
    fields: doc.fields ?? {},
    includeInMaster: doc.includeInMaster ?? true,
    googleCalendarEventId: doc.googleCalendarEventId ?? null,
    order: doc.order ?? 0,
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

/** Client-supplied fields when creating/editing a schedule item. */
export const scheduleItemInputSchema = z
  .object({
    section: sectionEnum,
    customLabel: z.string().trim().optional(),
    title: z.string().trim().min(1, 'Title is required.'),
    startAt: z.date().nullable().optional(),
    endAt: z.date().nullable().optional(),
    location: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    stageId: z.string().trim().optional(),
    advanceId: z.string().trim().optional(),
    slot: z.number().int().positive().nullable().optional(),
    fields: z.record(z.string(), z.string()).optional(),
    includeInMaster: z.boolean().optional(),
  })
  // Overnight items must resolve their end to the next day before this point (the form rolls
  // it); a stored end before its start is invalid and would produce a negative span / bad
  // calendar event. Mirrors eventInputSchema's date guard.
  .refine((v) => !v.startAt || !v.endAt || v.endAt.getTime() >= v.startAt.getTime(), {
    message: 'End time must be at or after the start time.',
    path: ['endAt'],
  });
export type ScheduleItemInput = z.infer<typeof scheduleItemInputSchema>;
