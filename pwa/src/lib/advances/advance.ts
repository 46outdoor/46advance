/**
 * Advance document model: `events/{eventId}/advances/{advanceId}`.
 * One advance per artist/performance. Types + Zod schemas + the Firestore
 * parser live together (mirrors src/lib/rbac). See sections.ts for the
 * section state machine.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';
import {
  SECTION_KEYS,
  sectionStatusSchema,
  type AdvanceSectionState,
  type AdvanceSections,
} from './sections';

export interface Advance {
  id: string;
  artistName: string;
  performanceDate: Date | null;
  stage: string | null;
  notes: string | null;
  sections: AdvanceSections;
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
  sections: z.record(z.string(), sectionStateDocSchema).optional(),
  createdBy: z.string().min(1),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Validate + normalize a raw advance doc. Missing/unknown sections default to not_started. */
export function parseAdvance(id: string, data: unknown): Advance {
  const doc = advanceDocSchema.parse(data);
  const sections = Object.fromEntries(
    SECTION_KEYS.map((key) => {
      const raw = doc.sections?.[key];
      const state: AdvanceSectionState = raw
        ? {
            status: raw.status,
            finalizedAt: timestampToDate(raw.finalizedAt ?? null),
            finalizedBy: raw.finalizedBy ?? null,
          }
        : { status: 'not_started', finalizedAt: null, finalizedBy: null };
      return [key, state];
    }),
  ) as AdvanceSections;

  return {
    id,
    artistName: doc.artistName,
    performanceDate: timestampToDate(doc.performanceDate ?? null),
    stage: doc.stage ?? null,
    notes: doc.notes ?? null,
    sections,
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
});
export type AdvanceInput = z.infer<typeof advanceInputSchema>;
