/**
 * Advance document model: `events/{eventId}/stages/{stageId}/advances/{advanceId}`.
 * One advance per artist/performance. Types + Zod schemas + the Firestore parser
 * live together (mirrors src/lib/rbac). Sections are department-keyed (sections.ts).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { parseSectionsMap, sectionsMapSchema, type AdvanceSections } from './sections';
import { advanceContentSchema, type AdvanceContent } from './fields';

export interface Advance {
  id: string;
  artistName: string;
  performanceDate: Date | null;
  stage: string | null;
  notes: string | null;
  /** Structured summary fields (roll up to the per-day report). */
  additions: string | null;
  concerns: string | null;
  pending: string | null;
  /** Advance call (ROADMAP §12): scheduled time + a meeting link (existing 11a, or Google Meet 11b). */
  advanceCallAt: Date | null;
  advanceCallLink: string | null;
  /** Calendar event id when the Meet was created via Google (Phase 11b); null otherwise. */
  googleCalendarEventId: string | null;
  sections: AdvanceSections;
  /** Per-department field values: content[deptId][fieldKey]. */
  content: AdvanceContent;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const advanceDocSchema = z.object({
  artistName: z.string().min(1),
  performanceDate: z.instanceof(Timestamp).nullable().optional(),
  stage: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  additions: z.string().nullable().optional(),
  concerns: z.string().nullable().optional(),
  pending: z.string().nullable().optional(),
  advanceCallAt: z.instanceof(Timestamp).nullable().optional(),
  advanceCallLink: z.string().nullable().optional(),
  googleCalendarEventId: z.string().nullable().optional(),
  sections: sectionsMapSchema.optional(),
  content: advanceContentSchema.optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw advance doc. Sections are department-keyed (dynamic). */
export function parseAdvance(id: string, data: unknown): Advance {
  const doc = advanceDocSchema.parse(data);
  const sections: AdvanceSections = parseSectionsMap(doc.sections ?? {});

  return {
    id,
    artistName: doc.artistName,
    performanceDate: timestampToDate(doc.performanceDate ?? null),
    stage: doc.stage ?? null,
    notes: doc.notes ?? null,
    additions: doc.additions ?? null,
    concerns: doc.concerns ?? null,
    pending: doc.pending ?? null,
    advanceCallAt: timestampToDate(doc.advanceCallAt ?? null),
    advanceCallLink: doc.advanceCallLink ?? null,
    googleCalendarEventId: doc.googleCalendarEventId ?? null,
    sections,
    content: doc.content ?? {},
    createdBy: doc.createdBy,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

/** Client-supplied fields when creating/editing an advance. */
export const advanceInputSchema = z.object({
  artistName: z.string().trim().min(1, 'Artist name is required.'),
  performanceDate: z.date().nullable().optional(),
  stage: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  additions: z.string().trim().optional(),
  concerns: z.string().trim().optional(),
  pending: z.string().trim().optional(),
  advanceCallAt: z.date().nullable().optional(),
  advanceCallLink: z.union([z.string().trim().url('Enter a valid URL.'), z.literal('')]).optional(),
});
export type AdvanceInput = z.infer<typeof advanceInputSchema>;
