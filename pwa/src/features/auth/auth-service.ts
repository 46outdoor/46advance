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

/** Upsert the caller's profile + resolve the global admin claim (allowlist). Call after sign-in. */
export async function syncUserClaims(): Promise<{ isAdmin: boolean }> {
  const callable = httpsCallable<unknown, { isAdmin: boolean }>(functions, 'syncUserClaims');
  const result = await callable();
  return result.data;
}
