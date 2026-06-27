/**
 * Admin data access: list users and manage per-event membership.
 * All writes here are gated by `firestore.rules` (admin-only); the UI guard
 * (`AdminGate`) is UX, the rules are the enforcement.
 */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';
import type {
  SetUserApprovedInput,
  SetUserApprovedOutput,
  SetUserOrganizerInput,
  SetUserOrganizerOutput,
} from '@contracts/callables/auth';
import {
  eventRoleSchema,
  parseEventMember,
  type EventMember,
  type EventRole,
} from '@/lib/rbac/roles';
import { parseEvent, type EventRecord } from '@/lib/events/event';

/** A membership row with its user id attached. */
export interface EventMemberRow extends EventMember {
  uid: string;
}

/** All events (admin reads every event per firestore.rules), name-sorted — for the assign picker. */
export async function listAllEvents(): Promise<EventRecord[]> {
  const snap = await getDocs(collection(db, 'events'));
  return snap.docs
    .map((d) => parseEvent(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
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
export async function setUserOrganizer(uid: string, organizer: boolean): Promise<SetUserOrganizerOutput> {
  const callable = httpsCallable<SetUserOrganizerInput, SetUserOrganizerOutput>(functions, 'setUserOrganizer');
  const result = await callable({ uid, organizer });
  return result.data;
}

/** Admin-only: approve/revoke a user's access to the app. */
export async function setUserApproved(uid: string, approved: boolean): Promise<SetUserApprovedOutput> {
  const callable = httpsCallable<SetUserApprovedInput, SetUserApprovedOutput>(functions, 'setUserApproved');
  const result = await callable({ uid, approved });
  return result.data;
}
