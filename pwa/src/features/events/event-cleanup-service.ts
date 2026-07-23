/**
 * Recursive-deletion callables (F-7). Advance/stage/quote deletion runs server-side
 * (functions/src/eventCleanup.ts) so the whole Firestore subtree + owned Storage are removed —
 * the client can't reach server-only subcollections (driveFiles) or delete Storage prefixes, and
 * Firestore deletes don't cascade. The advances/stages/quotes services delegate here.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

type Ok = { ok: boolean };

export async function deleteAdvanceCascade(
  eventId: string,
  stageId: string,
  advanceId: string,
): Promise<void> {
  await httpsCallable<{ eventId: string; stageId: string; advanceId: string }, Ok>(
    functions,
    'deleteAdvance',
  )({
    eventId,
    stageId,
    advanceId,
  });
}

export async function deleteStageCascade(eventId: string, stageId: string): Promise<void> {
  await httpsCallable<{ eventId: string; stageId: string }, Ok>(
    functions,
    'deleteStage',
  )({ eventId, stageId });
}

export async function deleteQuoteCascade(
  eventId: string,
  stageId: string,
  advanceId: string,
  quoteId: string,
): Promise<void> {
  await httpsCallable<{ eventId: string; stageId: string; advanceId: string; quoteId: string }, Ok>(
    functions,
    'deleteQuote',
  )({ eventId, stageId, advanceId, quoteId });
}
