/**
 * Crew travel & lodging backend (planning/CREW_TRAVEL_LODGING_PLAN.md §4.2): the identity
 * lifecycle around the denormalized `crewLogistics.userId` authorization field, plus the two
 * writes that moved server-side because rules cannot express them.
 *
 * Consistency model (per the plan — do not "simplify" it back into one mechanism):
 * - null→uid backfill and uid→null cleanup ride an eventually consistent, retryable path:
 *   the `reconcileCrewLogisticsOnContactWrite` trigger, plus synchronous best-effort calls
 *   from the sign-in/delete paths in index.ts. Safe: the transient states are "record not yet
 *   visible to its person" and "record still hidden", never a wrong grant.
 * - uid A→uid B relinking is NEVER eventually consistent: a half-applied relink authorizes
 *   the wrong account to read room numbers and confirmation codes. `relinkContactUser` does
 *   the whole move — contact, both users/{uid} pointers, every denormalized copy — in one
 *   bounded transaction, and fails BEFORE any write when over the record cap.
 */
import {
  getFirestore,
  FieldValue,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { assertAdmin } from './lib/auth/authorize.js';
import { assertCanEditEvent } from './google.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import { ChunkedBatch } from './lib/db/chunkedBatch.js';
import {
  detachEventContactInputSchema,
  relinkContactUserInputSchema,
  type DetachEventContactOutput,
  type RelinkContactUserOutput,
} from './contracts/callables/crewLogistics.js';

/**
 * Conservative cap for the atomic relink: every logistics record plus the contact and two
 * users/{uid} pointers must fit one 500-write transaction. Above this the relink fails with
 * an actionable maintenance error BEFORE any write — never a partial apply.
 */
export const RELINK_MAX_RECORDS = 400;

/**
 * Align the denormalized `userId` on every crewLogistics record referencing `contactId` with
 * the contact's current link. Eventually consistent by design (ChunkedBatch, not a
 * transaction) — callers use it ONLY for null→uid backfill and uid→null cleanup; A→B moves go
 * through `relinkContactUser`. Returns how many records were rewritten.
 */
export async function reconcileCrewLogisticsForContact(
  db: Firestore,
  contactId: string,
  userId: string | null,
): Promise<number> {
  const stale = await db
    .collectionGroup('crewLogistics')
    .where('contactId', '==', contactId)
    .get();
  const batch = new ChunkedBatch(db);
  let rewritten = 0;
  for (const doc of stale.docs) {
    if ((doc.get('userId') ?? null) === userId) continue;
    batch.set(doc.ref, { userId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    rewritten += 1;
  }
  await batch.commit();
  return rewritten;
}

/**
 * Retryable backstop for the lifecycle paths above: whenever a contact's `userId` changes
 * (including contact deletion → null), re-align the denormalized copies. Firestore triggers
 * re-run on failure, which is exactly the retry semantics the plan requires; the synchronous
 * calls from sign-in/delete only make the common case prompt.
 */
export const reconcileCrewLogisticsOnContactWrite = onDocumentWritten(
  'contacts/{contactId}',
  async (event) => {
    const before = event.data?.before?.get('userId') ?? null;
    const after = event.data?.after?.exists ? (event.data.after.get('userId') ?? null) : null;
    if (before === after) return;
    const contactId = event.params.contactId;
    const rewritten = await reconcileCrewLogisticsForContact(getFirestore(), contactId, after);
    if (rewritten > 0) {
      logger.info('crewLogistics userId reconciled', { contactId, after, rewritten });
    }
  },
);

/**
 * Detach a crew-roster attachment — the server-owned replacement for the direct client
 * delete. Refuses while any logistics record references the attachment (the PM deletes or
 * reassigns those first): rules cannot run that dependent query, and a silent orphan is not
 * acceptable. Transactional so a record created mid-call can't slip through. Membership is
 * deliberately NOT auto-removed — attaching auto-enrolls, detaching never revokes (matches
 * today's behavior).
 */
export const detachEventContact = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { eventId, attachId } = parseCallableData(detachEventContactInputSchema, request.data);
  const db = getFirestore();
  await assertCanEditEvent(db, request.auth.token, request.auth.uid, eventId);
  await enforceRateLimit(db, ['detachEventContact', request.auth.uid], 60);

  const attachRef = db.collection('events').doc(eventId).collection('contacts').doc(attachId);
  await db.runTransaction(async (tx) => {
    const attach = await tx.get(attachRef);
    if (!attach.exists) {
      throw new HttpsError('not-found', 'That crew member is no longer on this event.');
    }
    const dependents = await tx.get(
      db
        .collection('events')
        .doc(eventId)
        .collection('crewLogistics')
        .where('eventContactId', '==', attachId)
        .limit(1),
    );
    if (!dependents.empty) {
      throw new HttpsError(
        'failed-precondition',
        'This crew member still has travel or lodging records on this event. Delete or reassign them first.',
      );
    }
    tx.delete(attachRef);
  });
  const output: DetachEventContactOutput = { eventId, attachId, detached: true };
  return output;
});

/** All transaction reads for the relink, done before any write. */
async function readRelinkState(
  tx: Transaction,
  db: Firestore,
  contactId: string,
  uid: string | null,
) {
  const contactRef = db.collection('contacts').doc(contactId);
  const contact = await tx.get(contactRef);
  if (!contact.exists) throw new HttpsError('not-found', 'No such contact.');
  const oldUid: string | null = contact.get('userId') ?? null;

  // A uid links to at most one contact: refuse when the target account is already linked
  // elsewhere (the caller unlinks that contact first, explicitly).
  if (uid) {
    const conflict = await tx.get(
      db.collection('contacts').where('userId', '==', uid).limit(2),
    );
    const other = conflict.docs.find((d) => d.id !== contactId);
    if (other) {
      throw new HttpsError(
        'failed-precondition',
        'That account is already linked to a different contact. Unlink it first.',
      );
    }
  }

  const records = await tx.get(
    db.collectionGroup('crewLogistics').where('contactId', '==', contactId),
  );
  if (records.size > RELINK_MAX_RECORDS) {
    throw new HttpsError(
      'failed-precondition',
      `This contact has ${records.size} travel/lodging records — more than the ${RELINK_MAX_RECORDS} an atomic relink supports. This needs a maintenance migration; no changes were made.`,
    );
  }

  // Transactions require every read BEFORE the first write — resolve the old account's
  // pointer here, not in the write phase.
  let clearOldUserPointer = false;
  if (oldUid) {
    const oldUser = await tx.get(db.collection('users').doc(oldUid));
    clearOldUserPointer = oldUser.exists && oldUser.get('contactId') === contactId;
  }
  return { contactRef, oldUid, records, clearOldUserPointer };
}

/**
 * Admin-only atomic relink of a contact to an account (or to none) — the server-owned
 * replacement for the admin's direct `userId` rewrite, which the rules now refuse
 * (decision 13). One transaction moves the contact's link, both users/{uid} `contactId`
 * pointers, and every denormalized logistics copy together.
 */
export const relinkContactUser = onCall(async (request) => {
  assertAdmin(request.auth);
  const { contactId, uid } = parseCallableData(relinkContactUserInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['relinkContactUser', request.auth.uid], 30);

  // The target account must exist before we authorize it onto records (outside the txn:
  // Auth lookups aren't transactional anyway, and a deleted-account race just fails later).
  if (uid) {
    try {
      await getAuth().getUser(uid);
    } catch {
      throw new HttpsError('not-found', 'No account found for that user id.');
    }
  }

  const reconciledRecords = await db.runTransaction(async (tx) => {
    const { contactRef, oldUid, records, clearOldUserPointer } = await readRelinkState(
      tx,
      db,
      contactId,
      uid,
    );
    if (oldUid === uid) return 0; // no-op relink: nothing to move

    const now = FieldValue.serverTimestamp();
    tx.set(contactRef, { userId: uid, updatedAt: now }, { merge: true });
    if (uid) tx.set(db.collection('users').doc(uid), { contactId }, { merge: true });
    // Clear the old account's pointer only if it still pointed here (it may have been
    // re-linked to a different contact by sign-in since); resolved in the read phase.
    if (oldUid && clearOldUserPointer) {
      tx.set(
        db.collection('users').doc(oldUid),
        { contactId: FieldValue.delete() },
        { merge: true },
      );
    }
    for (const doc of records.docs) {
      tx.set(doc.ref, { userId: uid, updatedAt: now }, { merge: true });
    }
    return records.size;
  });

  logger.info('contact relinked', { contactId, uid, reconciledRecords });
  const output: RelinkContactUserOutput = { contactId, uid, reconciledRecords };
  return output;
});

/**
 * Best-effort synchronous reconciliation for the sign-in/delete paths in index.ts: makes the
 * common case prompt while the contact-write trigger stays the retryable guarantee. Never
 * throws — a failure here must not break sign-in or account deletion.
 */
export async function tryReconcileCrewLogistics(
  db: Firestore,
  contactId: string,
  userId: string | null,
): Promise<void> {
  try {
    await reconcileCrewLogisticsForContact(db, contactId, userId);
  } catch (err) {
    logger.warn('crewLogistics reconcile deferred to trigger', {
      contactId,
      error: String(err),
    });
  }
}
