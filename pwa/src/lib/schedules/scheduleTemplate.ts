/**
 * Schedule templates (redesign PR 3, planning/archive/feature/SCHEDULE_REDESIGN.md): reusable day-first
 * blueprints (`scheduleTemplates/{id}`) on the day-container model. A **standard**
 * template is a categorized list of template days — relative offsets (negative =
 * load-in) owning items that match the event schedule's item shape, with the stage
 * referenced by NAME (templates don't know an event's stage ids). A **master** template
 * composes standard templates by reference (ordered, one level deep) plus optional
 * inline days; at most one master is the default, auto-applied when an event is created
 * without an event template that supplies schedules (decision 23). Applying resolves
 * offsets against the event's start date in its timezone and merges into existing days
 * by date (decision 22) — that IO lives in the events feature.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { SCHEDULE_DAY_TYPE_KEYS, type ScheduleDayType } from './dayTypes';
import {
  crewLineInputSchema,
  scheduleDayItemDocSchema,
  scheduleDayItemInputSchema,
  type ScheduleDayItem,
} from './scheduleDay';

export const SCHEDULE_TEMPLATE_CATEGORIES = ['production', 'show', 'stagehand', 'other'] as const;
export type ScheduleTemplateCategory = (typeof SCHEDULE_TEMPLATE_CATEGORIES)[number];

const CATEGORY_LABELS: Record<ScheduleTemplateCategory, string> = {
  production: 'Production',
  show: 'Show',
  stagehand: 'Stagehand',
  other: 'Other',
};
export function scheduleTemplateCategoryLabel(c: ScheduleTemplateCategory): string {
  return CATEGORY_LABELS[c];
}

export const SCHEDULE_TEMPLATE_KINDS = ['standard', 'master'] as const;
export type ScheduleTemplateKind = (typeof SCHEDULE_TEMPLATE_KINDS)[number];

/** Relative-day label for a template day: negative = load-in (before show), 0+ = a show
 * day. (Templates have no real dates; the offset resolves against the event's show
 * start on apply.) */
export function templateDayLabel(offset: number): string {
  return offset < 0 ? `Load-in ${-offset}` : `Show day ${offset + 1}`;
}

/** A template item is a schedule-day item with the stage referenced by name and no
 * server-owned calendar field. */
export type ScheduleTemplateItem = Omit<ScheduleDayItem, 'stageId' | 'googleCalendarEventId'> & {
  stageName: string | null;
};

/** One template day: the day-container metadata on the relative-day axis, owning its
 * items (mirrors ScheduleDay). */
export interface ScheduleTemplateDay {
  offset: number;
  dayType: ScheduleDayType;
  title: string | null;
  description: string | null;
  notes: string | null;
  items: ScheduleTemplateItem[];
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  kind: ScheduleTemplateKind;
  category: ScheduleTemplateCategory;
  /** Master only: ordered ids of the standard templates it composes. */
  refs: string[];
  /** Master only: auto-applied on event creation (at most one — service-enforced). */
  isDefault: boolean;
  days: ScheduleTemplateDay[];
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const templateItemDocSchema = scheduleDayItemDocSchema
  .omit({ stageId: true, googleCalendarEventId: true })
  .extend({ stageName: z.string().nullable().optional() });

const templateDayDocSchema = z.object({
  offset: z.number().int(),
  dayType: z.enum(SCHEDULE_DAY_TYPE_KEYS),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(templateItemDocSchema).optional(),
});

const docSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(SCHEDULE_TEMPLATE_KINDS).optional(),
  category: z.enum(SCHEDULE_TEMPLATE_CATEGORIES),
  refs: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  days: z.array(templateDayDocSchema).optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** True for the fields only a master may carry. */
function hasMasterOnlyFields(v: { kind?: ScheduleTemplateKind; refs?: string[]; isDefault?: boolean }): boolean {
  return v.kind !== 'master' && ((v.refs?.length ?? 0) > 0 || v.isDefault === true);
}

function parseItem(raw: z.infer<typeof templateItemDocSchema>): ScheduleTemplateItem {
  return {
    id: raw.id,
    type: raw.type,
    customLabel: raw.customLabel ?? null,
    startTime: raw.startTime ?? null,
    endTime: raw.endTime ?? null,
    endEstimated: raw.endEstimated ?? false,
    item: raw.item,
    description: raw.description ?? null,
    stageName: raw.stageName ?? null,
    fields: raw.fields ?? {},
    crew: (raw.crew ?? []).map((c) => ({ type: c.type, quantity: c.quantity, hours: c.hours ?? null })),
    pushToCalendar: raw.pushToCalendar ?? true,
  };
}

/** Validate + normalize a raw schedule-template doc (days sorted by offset). Master-only
 * fields on a standard doc normalize away rather than reject — reads stay tolerant. */
export function parseScheduleTemplate(id: string, data: unknown): ScheduleTemplate {
  const doc = docSchema.parse(data);
  const kind = doc.kind ?? 'standard';
  return {
    id,
    name: doc.name,
    kind,
    category: doc.category,
    refs: kind === 'master' ? (doc.refs ?? []) : [],
    isDefault: kind === 'master' ? (doc.isDefault ?? false) : false,
    days: (doc.days ?? [])
      .map((d) => ({
        offset: d.offset,
        dayType: d.dayType,
        title: d.title ?? null,
        description: d.description ?? null,
        notes: d.notes ?? null,
        items: (d.items ?? []).map(parseItem),
      }))
      .sort((a, b) => a.offset - b.offset),
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const scheduleTemplateItemInputSchema = scheduleDayItemInputSchema
  .omit({ stageId: true })
  .extend({ stageName: z.string().trim().optional(), crew: z.array(crewLineInputSchema).optional() });

export const scheduleTemplateDayInputSchema = z.object({
  offset: z.number().int(),
  dayType: z.enum(SCHEDULE_DAY_TYPE_KEYS),
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(scheduleTemplateItemInputSchema).optional(),
});

/** Client-supplied fields when creating/editing a schedule template. Writes are strict:
 * refs and isDefault are master-only. */
export const scheduleTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.'),
    kind: z.enum(SCHEDULE_TEMPLATE_KINDS),
    category: z.enum(SCHEDULE_TEMPLATE_CATEGORIES),
    refs: z.array(z.string()).optional(),
    isDefault: z.boolean().optional(),
    days: z.array(scheduleTemplateDayInputSchema).optional(),
  })
  .refine((v) => !hasMasterOnlyFields(v), {
    message: 'Only a master template can compose others or be the default.',
  });
export type ScheduleTemplateInput = z.infer<typeof scheduleTemplateInputSchema>;

/** Merge template day lists by offset (decision 14): day metadata comes from the FIRST
 * source that defines an offset; later sources only contribute items. Sources are in
 * priority order; result sorted by offset. */
export function composeTemplateDays(
  sources: ReadonlyArray<readonly ScheduleTemplateDay[]>,
): ScheduleTemplateDay[] {
  const byOffset = new Map<number, ScheduleTemplateDay>();
  for (const days of sources) {
    for (const day of days) {
      const existing = byOffset.get(day.offset);
      if (existing) existing.items = [...existing.items, ...day.items];
      else byOffset.set(day.offset, { ...day, items: [...day.items] });
    }
  }
  return [...byOffset.values()].sort((a, b) => a.offset - b.offset);
}

/** Resolve a template to its effective days. A standard template is just its days; a
 * master composes its own inline days (highest priority — it defines day metadata)
 * with each referenced standard template in order. One level deep: refs to missing or
 * master templates are skipped. */
export function resolveTemplateDays(
  template: ScheduleTemplate,
  byId: ReadonlyMap<string, ScheduleTemplate>,
): ScheduleTemplateDay[] {
  if (template.kind !== 'master') return template.days;
  const sources = [
    template.days,
    ...template.refs.map((id) => {
      const ref = byId.get(id);
      return ref && ref.kind === 'standard' ? ref.days : [];
    }),
  ];
  return composeTemplateDays(sources);
}

/** Total item count across a template's own days (list-screen display). */
export function templateItemCount(template: ScheduleTemplate): number {
  return template.days.reduce((n, d) => n + d.items.length, 0);
}

/** Editor view bridge: a template item as a schedule-day item (stage name doubles as
 * the stage "id", so the shared grid's stage select lists names). */
export function templateItemToDayItem(item: ScheduleTemplateItem): ScheduleDayItem {
  const { stageName, ...rest } = item;
  return { ...rest, stageId: stageName, googleCalendarEventId: null };
}

/** Editor view bridge back: the grid's stage "id" is the stage name. */
export function dayItemToTemplateItem(item: ScheduleDayItem): ScheduleTemplateItem {
  const { stageId, googleCalendarEventId: _cal, ...rest } = item;
  return { ...rest, stageName: stageId };
}

/** Parsed days → input shape (the editor's save path). */
export function templateDaysToInput(
  days: readonly ScheduleTemplateDay[],
): NonNullable<ScheduleTemplateInput['days']> {
  return days.map((d) => ({
    offset: d.offset,
    dayType: d.dayType,
    title: d.title ?? undefined,
    description: d.description ?? undefined,
    notes: d.notes ?? undefined,
    items: d.items.map((i) => ({
      id: i.id,
      type: i.type,
      customLabel: i.customLabel ?? undefined,
      startTime: i.startTime,
      endTime: i.endTime,
      endEstimated: i.endEstimated,
      item: i.item,
      description: i.description ?? undefined,
      stageName: i.stageName ?? undefined,
      fields: i.fields,
      crew: i.crew,
      pushToCalendar: i.pushToCalendar,
    })),
  }));
}
