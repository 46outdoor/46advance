import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { User, UserCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/services/firebase';
import type { SyncUserClaimsOutput } from '@contracts/callables/auth';

export type { User };

/** Subscribe to auth state changes; returns an unsubscribe function. */
export function observeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // Kick off email verification immediately — no privileged claim (admin/approved) is
  // granted server-side until the address is verified (see syncUserClaims).
  await sendEmailVerification(cred.user);
  return cred;
}

/** Re-send the verification email to the currently signed-in (unverified) user. */
export async function resendVerificationEmail(): Promise<void> {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

/** Reload the current user from the server (picks up a freshly-verified email). */
export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export function sendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

/** Upsert the caller's profile + resolve global claims (admin allowlist, organizer). Call after sign-in. */
export async function syncUserClaims(): Promise<SyncUserClaimsOutput> {
  const callable = httpsCallable<unknown, SyncUserClaimsOutput>(functions, 'syncUserClaims');
  const result = await callable();
  return result.data;
}
