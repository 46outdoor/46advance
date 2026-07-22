/**
 * Recursive deletion callables (F-7). Client-side deletes leave nested Firestore docs and owned
 * Storage objects orphaned: advance/stage subtrees have subcollections a client can't reach
 * (driveFiles is `write: if false`), and Firestore deletes don't cascade. These admin/PM-gated
 * Admin-SDK callables delete the whole subtree (`recursiveDelete`) plus the Storage prefixes the
 * subtree owns. All are idempotent and retry-safe — re-running after a partial failure completes
 * the cleanup (deleting an absent doc/prefix is a no-op).
 *
 * Storage ownership (see the S10 deletion map):
 *   - a quote owns `events/{e}/quotes/{q}/`  (signed copy + generated PDFs)
 *   - a stage owns `events/{e}/production/stages/{s}/`  (production attachments)
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { OAUTH_SECRETS, assertCanEditEvent, bestEffortDeleteCalendarEvents } from './google.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  deleteAdvanceInputSchema,
  deleteQuoteInputSchema,
  deleteStageInputSchema,
} from './contracts/callables/eventCleanup.js';

const STORAGE_BUCKET = 'advancethat.firebasestorage.app';

/** The Storage prefix holding a quote's signed copy + generated PDFs. */
const quoteStoragePrefix = (eventId: string, quoteId: string): string => `events/${eventId}/quotes/${quoteId}/`;

/** Best-effort delete of every Storage object under a prefix; never throws so a Storage hiccup
 *  can't strand the Firestore cleanup (a retry re-runs it — deleting an absent prefix is a no-op). */
async function deleteStoragePrefix(prefix: string): Promise<void> {
  try {
    await getStorage().bucket(STORAGE_BUCKET).deleteFiles({ prefix });
  } catch (err) {
    logger.warn('Storage prefix cleanup failed (continuing)', { prefix, err });
  }
}

/** Delete a quote: its Storage prefix (signed copy + generated PDFs), then the doc. */
export const deleteQuote = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId, quoteId } = parseCallableData(deleteQuoteInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['deleteQuote', uid], 30);
  await assertCanEditEvent(db, token, uid, eventId);

  await deleteStoragePrefix(quoteStoragePrefix(eventId, quoteId));
  await db.doc(`events/${eventId}/stages/${stageId}/advances/${advanceId}/quotes/${quoteId}`).delete();
  return { ok: true };
});

/** Delete an advance and its whole subtree (driveFiles, documents, quotes) + each quote's Storage,
 *  and best-effort remove its advance-call Google Calendar event. */
export const deleteAdvance = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId, advanceId } = parseCallableData(deleteAdvanceInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['deleteAdvance', uid], 20);
  await assertCanEditEvent(db, token, uid, eventId);

  const advanceRef = db.doc(`events/${eventId}/stages/${stageId}/advances/${advanceId}`);
  const advanceSnap = await advanceRef.get(); // capture the calendar-event id BEFORE the subtree is gone
  const quotes = await advanceRef.collection('quotes').get();
  for (const q of quotes.docs) await deleteStoragePrefix(quoteStoragePrefix(eventId, q.id));
  await db.recursiveDelete(advanceRef);
  // A server-side delete bypasses the client's removeScheduleCalendarEvent, so clean up the
  // advance-call event here or it's orphaned in Google (WS-H). Best-effort — never blocks the delete.
  await bestEffortDeleteCalendarEvents(db, uid, eventId, [advanceSnap.get('googleCalendarEventId')]);
  return { ok: true };
});

/** Delete a stage and its whole subtree (every advance + its subtree, production + attachments)
 *  plus the Storage owned by those quotes and the stage's production attachments. */
export const deleteStage = onCall({ secrets: OAUTH_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, stageId } = parseCallableData(deleteStageInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['deleteStage', uid], 10);
  await assertCanEditEvent(db, token, uid, eventId);

  const stageRef = db.doc(`events/${eventId}/stages/${stageId}`);
  const advances = await stageRef.collection('advances').get();
  const advanceCalendarEventIds = advances.docs.map((a) => a.get('googleCalendarEventId')); // before delete
  for (const adv of advances.docs) {
    const quotes = await adv.ref.collection('quotes').get();
    for (const q of quotes.docs) await deleteStoragePrefix(quoteStoragePrefix(eventId, q.id));
  }
  await deleteStoragePrefix(`events/${eventId}/production/stages/${stageId}/`);
  await db.recursiveDelete(stageRef);
  // Best-effort: remove each advance's advance-call Google Calendar event (WS-H).
  await bestEffortDeleteCalendarEvents(db, uid, eventId, advanceCalendarEventIds);
  return { ok: true };
});
