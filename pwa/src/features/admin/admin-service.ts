/**
 * Admin data access: list users and manage per-event membership.
 * All writes here are gated by `firestore.rules` (admin-only); the UI guard
 * (`AdminGate`) is UX, the rules are the enforcement.
 */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, functions } from '@/services/firebase';
import type {
  DeleteUserInput,
  DeleteUserOutput,
  SetUserApprovedInput,
  SetUserApprovedOutput,
  SetUserDisplayNameInput,
  SetUserDisplayNameOutput,
  SetUserOrganizerInput,
  SetUserOrganizerOutput,
  SetUserProductionDirectorInput,
  SetUserProductionDirectorOutput,
} from '@contracts/callables/auth';
import { eventRoleSchema, type EventRole } from '@/lib/rbac/roles';
import { parseEvent, type EventRecord } from '@/lib/events/event';

/** All events (admin reads every event per firestore.rules), name-sorted — for the assign picker. */
export async function listAllEvents(): Promise<EventRecord[]> {
  const snap = await getDocs(collection(db, 'events'));
  return snap.docs
    .map((d) => parseEvent(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
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
): Promise<SetUserOrganizerOutput> {
  const callable = httpsCallable<SetUserOrganizerInput, SetUserOrganizerOutput>(
    functions,
    'setUserOrganizer',
  );
  const result = await callable({ uid, organizer });
  return result.data;
}

/**
 * Admin-only: grant/revoke the global `productionDirector` capability — read-only oversight
 * of EVERY event, with or without a membership row.
 *
 * Deliberately separate from `setUserOrganizer`: that capability means "may create events".
 * Folding oversight into it would make the Organizer toggle's label understate what it hands
 * out, at exactly the moment an admin is deciding whether to hand it out.
 */
export async function setUserProductionDirector(
  uid: string,
  productionDirector: boolean,
): Promise<SetUserProductionDirectorOutput> {
  const callable = httpsCallable<SetUserProductionDirectorInput, SetUserProductionDirectorOutput>(
    functions,
    'setUserProductionDirector',
  );
  const result = await callable({ uid, productionDirector });
  return result.data;
}

/** Admin-only: approve/revoke a user's access to the app. */
export async function setUserApproved(
  uid: string,
  approved: boolean,
): Promise<SetUserApprovedOutput> {
  const callable = httpsCallable<SetUserApprovedInput, SetUserApprovedOutput>(
    functions,
    'setUserApproved',
  );
  const result = await callable({ uid, approved });
  return result.data;
}

/** Admin-only: set a user's display name (empty string clears it → falls back to email). */
export async function setUserDisplayName(
  uid: string,
  displayName: string,
): Promise<SetUserDisplayNameOutput> {
  const callable = httpsCallable<SetUserDisplayNameInput, SetUserDisplayNameOutput>(
    functions,
    'setUserDisplayName',
  );
  const result = await callable({ uid, displayName });
  return result.data;
}

/** Admin-only: permanently delete an account (Auth + profile). The contact is kept, unlinked. */
export async function deleteUser(uid: string): Promise<DeleteUserOutput> {
  const callable = httpsCallable<DeleteUserInput, DeleteUserOutput>(functions, 'deleteUser');
  const result = await callable({ uid });
  return result.data;
}

/** Email a password-reset link to a user (Firebase sends it; works for password accounts). */
export async function sendUserPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}
