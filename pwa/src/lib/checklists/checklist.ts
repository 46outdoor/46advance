/**
 * Event checklist model (`events/{eventId}/checklist/{itemId}`) + the admin-managed
 * templates (`checklistTemplates/{templateId}`). A PM-only working surface — rules
 * require canEditEvent for READ as well as write, so department leads and techs
 * never see it, and it deliberately does not feed the advance tracker.
 *
 * Two fixed sections: the main list and "Post-Show" (decision 2026-08-03 — no
 * free-form grouping). Completion is a single nullable timestamp — `completedAt`
 * doubles as the done flag (null = not done), so the checkbox and the user-editable
 * time can never disagree.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

export const CHECKLIST_SECTIONS = ['main', 'post-show'] as const;
export type ChecklistSection = (typeof CHECKLIST_SECTIONS)[number];
export const checklistSectionSchema = z.enum(CHECKLIST_SECTIONS);

export const CHECKLIST_SECTION_LABELS: Record<ChecklistSection, string> = {
  main: 'Checklist',
  'post-show': 'Post-Show',
};

export interface ChecklistItem {
  id: string;
  text: string;
  section: ChecklistSection;
  /** Sort position within its section. */
  order: number;
  /** Doubles as the done flag: null = not done. User-editable after checking. */
  completedAt: Date | null;
}

const checklistItemDocSchema = z.object({
  text: z.string().min(1),
  section: checklistSectionSchema.optional(),
  order: z.number().optional(),
  completedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw checklist item doc. */
export function parseChecklistItem(id: string, data: unknown): ChecklistItem {
  const doc = checklistItemDocSchema.parse(data);
  return {
    id,
    text: doc.text,
    section: doc.section ?? 'main',
    order: doc.order ?? 0,
    completedAt: timestampToDate(doc.completedAt ?? null),
  };
}

/** Section-then-order sort shared by the panel and the import append logic. */
export function sortChecklistItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  const rank = (s: ChecklistSection) => CHECKLIST_SECTIONS.indexOf(s);
  return [...items].sort(
    (a, b) => rank(a.section) - rank(b.section) || a.order - b.order || a.id.localeCompare(b.id),
  );
}

/** Completion stamp, e.g. `08/03 2:41 PM`, in the event's timezone. */
export function formatChecklistTimestamp(date: Date | null, timeZone: string): string {
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

// ---- Templates (admin-managed, `checklistTemplates/{templateId}`) ----

export interface ChecklistTemplateItem {
  text: string;
  section: ChecklistSection;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  /** Ordered — array position is the order within each section. */
  items: ChecklistTemplateItem[];
  updatedAt: Date | null;
}

const templateItemSchema = z.object({
  text: z.string().min(1),
  section: checklistSectionSchema.optional(),
});

const checklistTemplateDocSchema = z.object({
  name: z.string().min(1),
  items: z.array(templateItemSchema).optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw checklist template doc. */
export function parseChecklistTemplate(id: string, data: unknown): ChecklistTemplate {
  const doc = checklistTemplateDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    items: (doc.items ?? []).map((i) => ({ text: i.text, section: i.section ?? 'main' })),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

/** Client-supplied fields when saving a template (admin editor). */
export const checklistTemplateInputSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required.'),
  items: z.array(
    z.object({ text: z.string().trim().min(1), section: checklistSectionSchema }),
  ),
});
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateInputSchema>;
