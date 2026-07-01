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

/** Relative-day label for a template item: negative = load-in (before show), 0+ = a show day.
 * (Templates have no real dates; the offset resolves against the event's show start on import.) */
export function templateDayLabel(offset: number): string {
  return offset < 0 ? `Load-in ${-offset}` : `Show day ${offset + 1}`;
}

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
  items: z.array(scheduleTemplateItemInputSchema).optional(),
});
export type ScheduleTemplateInput = z.infer<typeof scheduleTemplateInputSchema>;

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
