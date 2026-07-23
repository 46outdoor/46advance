import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { User, UserCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/services/firebase';
import type { SyncUserClaimsInput, SyncUserClaimsOutput } from '@contracts/callables/auth';

export type { User };

// The name entered at registration, stashed here BEFORE the account is created so the auth-state
// listener's syncUserClaims — which fires the instant the account exists, before updateProfile
// resolves — reliably carries it. Consumed (and cleared) by the next syncUserClaims call.
let pendingDisplayName: string | null = null;

/** Subscribe to auth state changes; returns an unsubscribe function. */
export function observeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string, name: string): Promise<UserCredential> {
  // Stash the name before creating the account (see `pendingDisplayName`), then persist it to the
  // Auth profile so it survives future sessions too.
  pendingDisplayName = name.trim() || null;
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (pendingDisplayName) await updateProfile(cred.user, { displayName: pendingDisplayName });
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

/** Upsert the caller's profile + resolve global claims (admin allowlist, organizer). Call after sign-in.
 *  Passes the registration name (or the persisted Auth profile name) so the server sets the display name. */
export async function syncUserClaims(): Promise<SyncUserClaimsOutput> {
  const displayName = pendingDisplayName ?? auth.currentUser?.displayName ?? null;
  pendingDisplayName = null;
  const callable = httpsCallable<SyncUserClaimsInput, SyncUserClaimsOutput>(functions, 'syncUserClaims');
  const result = await callable({ displayName });
  return result.data;
}
