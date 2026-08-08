/**
 * Per-user calendar-feed preferences (planning/CALENDAR_SUBSCRIPTIONS.md Phase 2):
 * `calendarSubscriptions/{uid}` holds which events the subscriber excludes, which render
 * as individual timed items instead of the default digest, and whether past events drop
 * off. Every field defaults to empty/false and the DOC ITSELF IS OPTIONAL — a missing doc
 * means "all my events, digest, keep history", so new events never need a backfill.
 *
 * Rules give the owner read; all writes come through `updateCalendarSubscription` (Admin
 * SDK), whose shared Zod contract enforces the exact field allowlist, bounded/deduped id
 * arrays, and a server-owned `updatedAt`. Membership remains the confidentiality gate:
 * listing an event id you are not a member of never grants access to it.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { assertActiveUser } from './lib/auth/authorize.js';
import { parseCallableData } from './lib/parseCallable.js';
import {
  CALENDAR_SUBSCRIPTION_DEFAULTS,
  getCalendarSubscriptionInputSchema,
  updateCalendarSubscriptionInputSchema,
  type CalendarSubscription,
} from './contracts/callables/calendarFeed.js';

/** Read-side normalization: tolerate a missing doc or partial/legacy fields. */
export function normalizeSubscription(data: DocumentData | undefined): CalendarSubscription {
  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  if (!data) return { ...CALENDAR_SUBSCRIPTION_DEFAULTS };
  return {
    itemModeEventIds: ids(data.itemModeEventIds),
    excludedEventIds: ids(data.excludedEventIds),
    hidePastEvents: data.hidePastEvents === true,
  };
}

/** The caller's preferences, defaulted when absent. */
export async function readSubscription(db: Firestore, uid: string): Promise<CalendarSubscription> {
  const snap = await db.doc(`calendarSubscriptions/${uid}`).get();
  return normalizeSubscription(snap.data());
}

/** Read the caller's feed preferences (defaults when they have never saved any). */
export const getCalendarSubscription = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  await assertActiveUser(request.auth);
  parseCallableData(getCalendarSubscriptionInputSchema, request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['getCalendarSubscription', request.auth.uid], 60);
  return readSubscription(db, request.auth.uid);
});

/**
 * Update the caller's feed preferences. Partial: omitted fields keep their current
 * value, so the picker can save one toggle without echoing the whole document back.
 * Returns the full normalized preferences so the client can seed its cache.
 */
export const updateCalendarSubscription = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  await assertActiveUser(request.auth);
  const input = parseCallableData(updateCalendarSubscriptionInputSchema, request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['updateCalendarSubscription', request.auth.uid], 60);

  const ref = db.doc(`calendarSubscriptions/${request.auth.uid}`);
  const next = await db.runTransaction(async (tx) => {
    const current = normalizeSubscription((await tx.get(ref)).data());
    const merged: CalendarSubscription = {
      itemModeEventIds: input.itemModeEventIds ?? current.itemModeEventIds,
      excludedEventIds: input.excludedEventIds ?? current.excludedEventIds,
      hidePastEvents: input.hidePastEvents ?? current.hidePastEvents,
    };
    tx.set(ref, { ...merged, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return merged;
  });
  return next;
});
