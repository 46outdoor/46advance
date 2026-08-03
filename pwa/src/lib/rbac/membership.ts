/**
 * Per-event membership data access (`events/{eventId}/members/{uid}`).
 * Keeps Firestore IO out of the pure permission predicates in `permissions.ts`.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { parseEventMember, type EventMember, type EventRole } from './roles';

/** A membership row with its user id (the doc id) attached. */
export interface EventMemberRow extends EventMember {
  uid: string;
}

/** React Query key for an event's member roster. */
export const eventMembersKey = (eventId: string) => ['events', 'members', eventId] as const;

/** All members of an event (rules: any member or admin may read the roster). */
export async function listEventMembers(eventId: string): Promise<EventMemberRow[]> {
  const snap = await getDocs(collection(db, 'events', eventId, 'members'));
  return snap.docs.map((d) => ({ uid: d.id, ...parseEventMember(d.data()) }));
}

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
