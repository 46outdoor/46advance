import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
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

export function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
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
