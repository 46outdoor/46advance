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
 * Called by the client after sign-in. Upserts the caller's `users/{uid}` profile and
 * sets/clears the global `admin` custom claim from the allowlist. Returns `{ isAdmin }`.
 * Idempotent; works for existing and new accounts.
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
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return { isAdmin };
});
