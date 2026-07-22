/**
 * Callable contract schemas — recursive deletion (F-7). Admin/PM-gated server deletes that
 * cascade a Firestore subtree + its owned Storage objects, which client-side deletes can't do
 * (driveFiles is server-write-only, and Firestore deletes don't recurse into subcollections).
 * Pure Zod — see ./auth.ts header.
 */
import { z } from 'zod';

export const deleteQuoteInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
  advanceId: z.string().min(1),
  quoteId: z.string().min(1),
});
export type DeleteQuoteInput = z.infer<typeof deleteQuoteInputSchema>;

export const deleteAdvanceInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
  advanceId: z.string().min(1),
});
export type DeleteAdvanceInput = z.infer<typeof deleteAdvanceInputSchema>;

export const deleteStageInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().min(1),
});
export type DeleteStageInput = z.infer<typeof deleteStageInputSchema>;
