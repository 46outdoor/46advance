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
  /**
   * Lineup slot count the PM chose per show day (key = 'YYYY-MM-DD' day key, or
   * 'default' for undated events) — the "+ Add slot"/"− Remove slot" persistence.
   * Absent keys fall back to the UI default (5 main / 4 side); booked slots always
   * render regardless.
   */
  slotBaselines: Record<string, number>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const stageDocSchema = z.object({
  name: z.string().min(1),
  order: z.number().optional(),
  notes: z.string().nullable().optional(),
  slotBaselines: z.record(z.string(), z.number()).optional(),
  createdAt: z.instanceof(Timestamp).nullable().optional(),
  updatedAt: z.instanceof(Timestamp).nullable().optional(),
});

/** Map a lineup group key (day key, or '' for the undated group) to its baseline key —
 *  Firestore field paths can't be empty. */
export function slotBaselineKey(groupKey: string): string {
  return groupKey || 'default';
}

export function parseStage(id: string, data: unknown): StageRecord {
  const doc = stageDocSchema.parse(data);
  return {
    id,
    name: doc.name,
    order: doc.order ?? 0,
    notes: doc.notes ?? null,
    slotBaselines: doc.slotBaselines ?? {},
    createdAt: timestampToDate(doc.createdAt ?? null),
    updatedAt: timestampToDate(doc.updatedAt ?? null),
  };
}

export const stageInputSchema = z.object({
  name: z.string().trim().min(1, 'Stage name is required.'),
  notes: z.string().trim().optional(),
});
export type StageInput = z.infer<typeof stageInputSchema>;
