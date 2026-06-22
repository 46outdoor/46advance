/**
 * Per-event membership data access (`events/{eventId}/members/{uid}`).
 * Keeps Firestore IO out of the pure permission predicates in `permissions.ts`.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseEventMember, type EventMember, type EventRole } from './roles';

/** Read a single membership doc, or `null` if the user is not a member. */
export async function getEventMember(uid: string, eventId: string): Promise<EventMember | null> {
  const snap = await getDoc(doc(db, 'events', eventId, 'members', uid));
  return snap.exists() ? parseEventMember(snap.data()) : null;
}

/** Resolve a user's per-event role, or `null` if they have none. */
export async function getEventRole(uid: string, eventId: string): Promise<EventRole | null> {
  const member = await getEventMember(uid, eventId);
  return member?.role ?? null;
}
