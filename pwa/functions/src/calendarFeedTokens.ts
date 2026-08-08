/**
 * Calendar subscription feed credentials (planning/archive/feature/CALENDAR_SUBSCRIPTIONS.md Phase 1).
 *
 * One active 256-bit bearer token per user: `calendarFeeds/{sha256(token)}` is the
 * endpoint's O(1) lookup (only the digest is stored — a leaked database never yields a
 * working URL), `calendarFeedOwners/{uid}` the one-active-feed pointer. Create and
 * rotate run in a TRANSACTION — revoke the previous token doc, create the new one,
 * move the pointer — so a user can never hold two live feeds. The full URL is returned
 * exactly once per mint; status never re-exposes it. `setUserApproved(false)` and
 * `deleteUser` revoke through `revokeCalendarFeedForUser`; the endpoint's authoritative
 * user check stays the fail-closed backstop if that cleanup is interrupted.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { assertActiveUser } from './lib/auth/authorize.js';
import { parseCallableData } from './lib/parseCallable.js';
import { httpsFunctionUrl } from './lib/http/functionUrl.js';
import {
  createCalendarFeedInputSchema,
  getCalendarFeedStatusInputSchema,
  rotateCalendarFeedInputSchema,
} from './contracts/callables/calendarFeed.js';

/** SHA-256 hex digest of a raw feed token — the `calendarFeeds` document id. */
export function feedTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The public feed base: the custom domain, proxied to the function by the Hosting
 * rewrite (`firebase.json` → `/calendar-feed`). The direct cloudfunctions.net URL keeps
 * working for URLs minted before the switch — same function, same token check. */
const FEED_PUBLIC_URL = 'https://46advance.com/calendar-feed';

/** The full subscription URL for a raw token (shown once at mint). Emulator runs hit
 * the function directly — there is no Hosting proxy locally. */
export function calendarFeedUrl(token: string): string {
  const base =
    process.env.FUNCTIONS_EMULATOR === 'true' ? httpsFunctionUrl('calendarFeed') : FEED_PUBLIC_URL;
  return `${base}?token=${token}`;
}

/**
 * Transactionally mint a fresh token for `uid`: revoke the previously active token doc
 * (if any), create the new one, and move the owner pointer. `failIfActive` makes the
 * create path refuse inside the SAME transaction (a pre-transaction check would let two
 * concurrent creates both mint, handing one caller a silently-dead URL). Returns the
 * RAW token — the only moment it exists outside the caller's hands.
 */
async function issueFeedToken(db: Firestore, uid: string, failIfActive = false): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = feedTokenHash(token);
  await db.runTransaction(async (tx) => {
    const ownerRef = db.doc(`calendarFeedOwners/${uid}`);
    const ownerSnap = await tx.get(ownerRef);
    const prevHash = ownerSnap.data()?.activeTokenHash;
    if (typeof prevHash === 'string' && prevHash) {
      const prevSnap = await tx.get(db.doc(`calendarFeeds/${prevHash}`));
      if (failIfActive && prevSnap.exists && prevSnap.data()?.revokedAt == null) {
        throw new HttpsError('already-exists', 'You already have a feed URL — rotate it instead.');
      }
      tx.set(
        db.doc(`calendarFeeds/${prevHash}`),
        { revokedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    tx.set(db.doc(`calendarFeeds/${tokenHash}`), {
      uid,
      createdAt: FieldValue.serverTimestamp(),
      lastAccessedAt: null,
      revokedAt: null,
    });
    tx.set(ownerRef, {
      activeTokenHash: tokenHash,
      createdAt: ownerSnap.data()?.createdAt ?? FieldValue.serverTimestamp(),
      rotatedAt: ownerSnap.exists ? FieldValue.serverTimestamp() : null,
    });
  });
  return token;
}

/**
 * Revoke `uid`'s active feed token (idempotent; transactional against a concurrent
 * rotate). `removeOwnerPointer` additionally deletes the pointer doc — deleteUser's
 * full cleanup; setUserApproved(false) keeps the pointer so a later re-approval shows
 * an inactive feed to rotate rather than a phantom "never created" state.
 */
export async function revokeCalendarFeedForUser(
  db: Firestore,
  uid: string,
  removeOwnerPointer = false,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ownerRef = db.doc(`calendarFeedOwners/${uid}`);
    const ownerSnap = await tx.get(ownerRef);
    const hash = ownerSnap.data()?.activeTokenHash;
    if (typeof hash === 'string' && hash) {
      tx.set(
        db.doc(`calendarFeeds/${hash}`),
        { revokedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    if (removeOwnerPointer && ownerSnap.exists) tx.delete(ownerRef);
  });
}

/**
 * Mint the caller's calendar feed (active users only). Fails `already-exists` when an
 * unrevoked feed exists — rotation is a deliberate, warned action, never an accident
 * of clicking create twice. Returns `{ url }`, shown once.
 */
export const createCalendarFeed = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  await assertActiveUser(request.auth);
  parseCallableData(createCalendarFeedInputSchema, request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['createCalendarFeed', request.auth.uid], 10);

  const token = await issueFeedToken(db, request.auth.uid, true);
  return { url: calendarFeedUrl(token) };
});

/**
 * Revoke the caller's current feed URL and mint a replacement (also serves as create
 * when none exists — e.g. after an admin revocation). The old URL stops updating
 * immediately; every subscribed calendar app needs the new one.
 */
export const rotateCalendarFeed = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  await assertActiveUser(request.auth);
  parseCallableData(rotateCalendarFeedInputSchema, request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['rotateCalendarFeed', request.auth.uid], 10);

  const token = await issueFeedToken(db, request.auth.uid);
  return { url: calendarFeedUrl(token) };
});

/**
 * Non-secret feed status for the Settings card (the token collections deny client
 * reads). Never returns the token or URL.
 */
export const getCalendarFeedStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  await assertActiveUser(request.auth);
  parseCallableData(getCalendarFeedStatusInputSchema, request.data ?? {});
  const db = getFirestore();
  await enforceRateLimit(db, ['getCalendarFeedStatus', request.auth.uid], 30);

  const millis = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);
  const ownerSnap = await db.doc(`calendarFeedOwners/${request.auth.uid}`).get();
  const activeHash = ownerSnap.data()?.activeTokenHash;
  const tokenSnap =
    typeof activeHash === 'string' && activeHash
      ? await db.doc(`calendarFeeds/${activeHash}`).get()
      : null;
  const tokenData = tokenSnap?.exists ? tokenSnap.data() : undefined;
  return {
    active: tokenData != null && tokenData.revokedAt == null,
    createdAt: millis(ownerSnap.data()?.createdAt),
    rotatedAt: millis(ownerSnap.data()?.rotatedAt),
    lastAccessedAt: millis(tokenData?.lastAccessedAt),
  };
});
