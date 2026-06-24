/**
 * User directory reads (`users/{uid}`). Shared lib (admin tool + template editor).
 * Profiles are server-managed (syncUserClaims); reads are admin-gated by firestore.rules.
 */
import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { timestampToDate } from '@/lib/firestore/timestamps';
import type { UserProfile } from '@/types';

function toUserProfile(uid: string, data: DocumentData): UserProfile {
  return {
    uid,
    email: data.email ?? null,
    displayName: data.displayName ?? null,
    isAdmin: data.isAdmin === true,
    organizer: data.organizer === true,
    approved: data.approved === true,
    createdAt: timestampToDate(data.createdAt ?? null),
    lastSeenAt: timestampToDate(data.lastSeenAt ?? null),
  };
}

/** All user profiles. */
export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => toUserProfile(d.id, d.data()));
}
