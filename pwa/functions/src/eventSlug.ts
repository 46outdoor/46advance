/**
 * Transactional slug rename (WS-G). Renaming an event's URL slug used to be a plain client
 * `updateDoc(events/{id}, { slug })` with NO uniqueness check — the worst of the slug gaps,
 * since it could silently duplicate an existing slug. This admin/PM-gated callable moves the
 * canonical `slugs/{slug}` reservation atomically: reserve the new slug, release the old one,
 * and update `events/{id}.slug` in a single transaction. Idempotent when the desired slug
 * already resolves to the event's current slug.
 */
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertCanEditEvent } from './google.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import { renameEventSlugInputSchema } from './contracts/callables/events.js';
import { findFreeSlug, slugify } from './lib/events/slug.js';

export const renameEventSlug = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const { eventId, slug } = parseCallableData(renameEventSlugInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['renameEventSlug', uid], 30);
  await assertCanEditEvent(db, token, uid, eventId);

  const eventRef = db.doc(`events/${eventId}`);
  const base = slugify(slug);

  return db.runTransaction(async (tx) => {
    // --- reads (all before any write, per the transaction contract) ---
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
    const currentSlug = typeof eventSnap.get('slug') === 'string' ? (eventSnap.get('slug') as string) : null;

    const { slug: chosen, claimRef } = await findFreeSlug(tx, db, base, eventId);
    if (chosen === currentSlug) return { slug: chosen }; // no-op rename to the current slug

    // Release the old reservation only if THIS event owns it (never delete another event's,
    // even under pre-backfill inconsistency — the backfill audit surfaces such cases).
    let releaseRef: DocumentReference | null = null;
    if (currentSlug) {
      const oldRef = db.collection('slugs').doc(currentSlug);
      const oldSnap = await tx.get(oldRef);
      if (oldSnap.exists && oldSnap.get('eventId') === eventId) releaseRef = oldRef;
    }

    // --- writes ---
    if (claimRef) tx.set(claimRef, { eventId, createdAt: FieldValue.serverTimestamp() });
    if (releaseRef) tx.delete(releaseRef);
    tx.update(eventRef, { slug: chosen, updatedAt: FieldValue.serverTimestamp() });
    return { slug: chosen };
  });
});
