/**
 * Stage document model: `events/{eventId}/stages/{stageId}`. A festival holds many
 * stages; each stage holds advances. Type + Zod + parser together (mirrors event.ts).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { timestampToDate } from '@/lib/firestore/timestamps';

export interface StageRecord {
  id: string;
  name: string;
  order: number;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const stageDocSchema = z.object({
  name: z.string().min(1),
  order: z.number().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

export function parseStage(id: string, data: unknown): StageRecord {
  const doc = stageDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    order: doc.order ?? 0,
    notes: doc.notes ?? null,
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const stageInputSchema = z.object({
  name: z.string().trim().min(1, 'Stage name is required.'),
  notes: z.string().trim().optional(),
});
export type StageInput = z.infer<typeof stageInputSchema>;
