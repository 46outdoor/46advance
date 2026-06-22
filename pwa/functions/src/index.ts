import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** Emails granted the global admin role (allowlist). */
const ADMIN_EMAILS = ['jared@46entertainment.com'].map((email) => email.toLowerCase());

/**
 * Called by the client after sign-in. Upserts the caller's `users/{uid}` profile,
 * sets/clears the global `admin` claim from the allowlist, and surfaces the global
 * `organizer` claim (set by an admin via setUserOrganizer). Returns
 * `{ isAdmin, isOrganizer }`. Idempotent; works for existing and new accounts.
 */
export const syncUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const email = token.email ?? null;
  const isAdmin = email !== null && ADMIN_EMAILS.includes(email.toLowerCase());

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  const isOrganizer = existing.organizer === true;
  if (existing.admin !== isAdmin) {
    await adminAuth.setCustomUserClaims(uid, { ...existing, admin: isAdmin });
  }

  const ref = getFirestore().collection('users').doc(uid);
  const snap = await ref.get();
  await ref.set(
    {
      email,
      displayName: token.name ?? null,
      isAdmin,
      organizer: isOrganizer,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return { isAdmin, isOrganizer };
});

/**
 * Admin-only. Grants/revokes the global `organizer` capability (lets a user create
 * events). Sets the custom claim and mirrors `users/{uid}.organizer`. The target
 * user picks up the claim on their next token refresh / sign-in.
 */
export const setUserOrganizer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  const uid = request.data?.uid;
  const organizer = request.data?.organizer;
  if (typeof uid !== 'string' || uid.length === 0 || typeof organizer !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Expected { uid: string, organizer: boolean }.');
  }

  const adminAuth = getAuth();
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, organizer });
  await getFirestore().collection('users').doc(uid).set({ organizer }, { merge: true });

  return { uid, organizer };
});
