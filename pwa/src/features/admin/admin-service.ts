/**
 * Admin data access: list users and manage per-event membership.
 * All writes here are gated by `firestore.rules` (admin-only); the UI guard
 * (`AdminGate`) is UX, the rules are the enforcement.
 */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';
import { timestampToDate } from '@/lib/firestore/timestamps';
import {
  eventRoleSchema,
  parseEventMember,
  type EventMember,
  type EventRole,
} from '@/lib/rbac/roles';
import type { UserProfile } from '@/types';

function toUserProfile(uid: string, data: DocumentData): UserProfile {
  return {
    uid,
    email: data.email ?? null,
    displayName: data.displayName ?? null,
    isAdmin: data.isAdmin === true,
    organizer: data.organizer === true,
    createdAt: timestampToDate(data.createdAt ?? null),
    lastSeenAt: timestampToDate(data.lastSeenAt ?? null),
  };
}

/** All user profiles (admin-only read). */
export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => toUserProfile(d.id, d.data()));
}

/** A membership row with its user id attached. */
export interface EventMemberRow extends EventMember {
  uid: string;
}

/** All members of an event. */
export async function listEventMembers(eventId: string): Promise<EventMemberRow[]> {
  const snap = await getDocs(collection(db, 'events', eventId, 'members'));
  return snap.docs.map((d) => ({ uid: d.id, ...parseEventMember(d.data()) }));
}

/** Assign (or update) a user's per-event role. `addedBy` is the acting admin's uid. */
export async function assignEventMember(
  eventId: string,
  uid: string,
  role: EventRole,
  addedBy: string,
): Promise<void> {
  await setDoc(doc(db, 'events', eventId, 'members', uid), {
    role: eventRoleSchema.parse(role),
    addedBy,
    addedAt: serverTimestamp(),
    uid, // mirrors the doc id so collectionGroup("members").where("uid","==",me) can list events
  });
}

/** Remove a user from an event. */
export async function removeEventMember(eventId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'members', uid));
}

/** Admin-only: grant/revoke a user's global `organizer` capability (event creation). */
export async function setUserOrganizer(
  uid: string,
  organizer: boolean,
): Promise<{ uid: string; organizer: boolean }> {
  const callable = httpsCallable<
    { uid: string; organizer: boolean },
    { uid: string; organizer: boolean }
  >(functions, 'setUserOrganizer');
  const result = await callable({ uid, organizer });
  return result.data;
}
