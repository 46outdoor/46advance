/**
 * Advance document model: `events/{eventId}/stages/{stageId}/advances/{advanceId}`.
 * One advance per artist/performance. Types + Zod schemas + the Firestore parser
 * live together (mirrors src/lib/rbac). Sections are department-keyed (sections.ts).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import { sectionStatusSchema, type AdvanceSections } from './sections';
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
  sections: AdvanceSections;
  /** Per-department field values: content[deptId][fieldKey]. */
  content: AdvanceContent;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const sectionStateDocSchema = z.object({
  status: sectionStatusSchema,
  finalizedAt: z.instanceof(Timestamp).nullable().optional(),
  finalizedBy: z.string().nullable().optional(),
});

const advanceDocSchema = z.object({
  artistName: z.string().min(1),
  performanceDate: z.instanceof(Timestamp).nullable().optional(),
  stage: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  additions: z.string().nullable().optional(),
  concerns: z.string().nullable().optional(),
  pending: z.string().nullable().optional(),
  sections: z.record(z.string(), sectionStateDocSchema).optional(),
  content: advanceContentSchema.optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw advance doc. Sections are department-keyed (dynamic). */
export function parseAdvance(id: string, data: unknown): Advance {
  const doc = advanceDocSchema.parse(data);
  const sections: AdvanceSections = {};
  for (const [key, raw] of Object.entries(doc.sections ?? {})) {
    sections[key] = {
      status: raw.status,
      finalizedAt: timestampToDate(raw.finalizedAt ?? null),
      finalizedBy: raw.finalizedBy ?? null,
    };
  }

  return {
    id,
    artistName: doc.artistName,
    performanceDate: timestampToDate(doc.performanceDate ?? null),
    stage: doc.stage ?? null,
    notes: doc.notes ?? null,
    additions: doc.additions ?? null,
    concerns: doc.concerns ?? null,
    pending: doc.pending ?? null,
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
});
export type AdvanceInput = z.infer<typeof advanceInputSchema>;
