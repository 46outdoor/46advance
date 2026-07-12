/**
 * Schedule template ("sub-template"): a reusable, categorized list of schedule-item blueprints
 * (`scheduleTemplates/{id}`). Authored in admin; "imported" into an event's schedule (or applied
 * by an event template). On import each blueprint becomes a real `scheduleItems` doc — its
 * relative day + wall-clock time resolve against the event's start date in the event's timezone
 * (default Central), and its stage matches the event's stages by name.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { APP_TIME_ZONE, shiftDayKey, zonedDayKey, zonedInputToDate } from '@/lib/dates/timezone';
import { SCHEDULE_SECTION_KEYS, type ScheduleSection } from './sections';

export const SCHEDULE_TEMPLATE_CATEGORIES = ['production', 'show', 'stagehand', 'other'] as const;
export type ScheduleTemplateCategory = (typeof SCHEDULE_TEMPLATE_CATEGORIES)[number];
const categoryEnum = z.enum(SCHEDULE_TEMPLATE_CATEGORIES);

const CATEGORY_LABELS: Record<ScheduleTemplateCategory, string> = {
  production: 'Production',
  show: 'Show',
  stagehand: 'Stagehand',
  other: 'Other',
};
export function scheduleTemplateCategoryLabel(c: ScheduleTemplateCategory): string {
  return CATEGORY_LABELS[c];
}

/** Section a new blueprint item starts on, matching the template's category ('other' has no
 * section counterpart, so it keeps the Production default). */
const CATEGORY_DEFAULT_SECTION: Record<ScheduleTemplateCategory, ScheduleSection> = {
  production: 'production',
  show: 'show',
  stagehand: 'labor',
  other: 'production',
};
export function categoryDefaultSection(c: ScheduleTemplateCategory): ScheduleSection {
  return CATEGORY_DEFAULT_SECTION[c];
}

/** Relative-day label for a template item: negative = load-in (before show), 0+ = a show day.
 * (Templates have no real dates; the offset resolves against the event's show start on import.) */
export function templateDayLabel(offset: number): string {
  return offset < 0 ? `Load-in ${-offset}` : `Show day ${offset + 1}`;
}

/** A labeled operational day in the template (e.g. "Stage Build Day 1 + Pre Rig" on Load-in 3).
 * `offset` is the same relative-day axis items use — items attach to a day via `dayOffset`. */
export interface ScheduleTemplateDay {
  offset: number;
  label: string;
}

const dayDocSchema = z.object({ offset: z.number().int(), label: z.string() });

/** One blueprint row: like a ScheduleItem but with a relative day + wall-clock time (resolved on
 * apply) and a stage referenced by name (the template doesn't know the event's stage ids). */
export interface ScheduleTemplateItem {
  id: string;
  section: ScheduleSection;
  customLabel: string | null;
  title: string;
  /** 0-based festival day (0 = the event's start date). */
  dayOffset: number;
  /** 'HH:mm' wall-clock start in the event's timezone; null = no time. */
  timeOfDay: string | null;
  /** 'HH:mm' wall-clock end; null = none. */
  endTimeOfDay: string | null;
  /** The end time is an estimate (e.g. labor grids' "Est End Time"). */
  endEstimated: boolean;
  /** Stage matched by name to the event's stages on apply; null = event-wide. */
  stageName: string | null;
  slot: number | null;
  location: string | null;
  notes: string | null;
  fields: Record<string, string>;
  includeInMaster: boolean;
  order: number;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  category: ScheduleTemplateCategory;
  days: ScheduleTemplateDay[];
  items: ScheduleTemplateItem[];
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const itemDocSchema = z.object({
  id: z.string().min(1),
  section: z.enum(SCHEDULE_SECTION_KEYS),
  customLabel: z.string().nullable().optional(),
  title: z.string().min(1),
  dayOffset: z.number().int().optional(),
  timeOfDay: z.string().nullable().optional(),
  endTimeOfDay: z.string().nullable().optional(),
  endEstimated: z.boolean().optional(),
  stageName: z.string().nullable().optional(),
  slot: z.number().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  includeInMaster: z.boolean().optional(),
  order: z.number().optional(),
});

const docSchema = z.object({
  name: z.string().min(1),
  category: categoryEnum,
  days: z.array(dayDocSchema).optional(),
  items: z.array(itemDocSchema).optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

function parseItem(raw: z.infer<typeof itemDocSchema>): ScheduleTemplateItem {
  return {
    id: raw.id,
    section: raw.section,
    customLabel: raw.customLabel ?? null,
    title: raw.title,
    dayOffset: raw.dayOffset ?? 0,
    timeOfDay: raw.timeOfDay ?? null,
    endTimeOfDay: raw.endTimeOfDay ?? null,
    endEstimated: raw.endEstimated ?? false,
    stageName: raw.stageName ?? null,
    slot: raw.slot ?? null,
    location: raw.location ?? null,
    notes: raw.notes ?? null,
    fields: raw.fields ?? {},
    includeInMaster: raw.includeInMaster ?? true,
    order: raw.order ?? 0,
  };
}

/** Validate + normalize a raw schedule-template doc. */
export function parseScheduleTemplate(id: string, data: unknown): ScheduleTemplate {
  const doc = docSchema.parse(data);
  return {
    id,
    name: doc.name,
    category: doc.category,
    days: [...(doc.days ?? [])].sort((a, b) => a.offset - b.offset),
    items: (doc.items ?? []).map(parseItem).sort((a, b) => a.order - b.order),
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const scheduleTemplateItemInputSchema = z.object({
  id: z.string().min(1),
  section: z.enum(SCHEDULE_SECTION_KEYS),
  customLabel: z.string().nullable().optional(),
  title: z.string().trim().min(1),
  dayOffset: z.number().int(),
  timeOfDay: z.string().nullable().optional(),
  endTimeOfDay: z.string().nullable().optional(),
  endEstimated: z.boolean().optional(),
  stageName: z.string().nullable().optional(),
  slot: z.number().int().positive().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  includeInMaster: z.boolean().optional(),
  order: z.number().optional(),
});

/** Client-supplied fields when creating/editing a schedule template. */
export const scheduleTemplateInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  category: categoryEnum,
  days: z.array(z.object({ offset: z.number().int(), label: z.string().trim().min(1) })).optional(),
  items: z.array(scheduleTemplateItemInputSchema).optional(),
});
export type ScheduleTemplateInput = z.infer<typeof scheduleTemplateInputSchema>;

/** Duration in hours (2-dp) between two 'HH:mm' wall-clock times — an end at or before the
 * start wraps overnight (22:00 → 02:00 = 4). Null without both times or for a zero span. */
export function wallClockHours(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const span = (mins(end) - mins(start) + 1440) % 1440;
  return span > 0 ? Math.round((span / 60) * 100) / 100 : null;
}

/**
 * Resolve a blueprint's relative day + wall-clock time to a UTC instant against the event's
 * start date, in the event's `timeZone` (default Central). The event day is derived in that
 * zone — NOT the browser's — so an imported item lands on the right calendar day regardless of
 * the viewer's location. Returns null when there's no start date or no time-of-day.
 */
export function templateItemInstant(
  eventStart: Date | null,
  dayOffset: number,
  timeOfDay: string | null,
  timeZone: string = APP_TIME_ZONE,
): Date | null {
  if (!eventStart || !timeOfDay) return null;
  const dayKey = shiftDayKey(zonedDayKey(eventStart, timeZone), dayOffset);
  return zonedInputToDate(`${dayKey}T${timeOfDay}`, timeZone);
}
