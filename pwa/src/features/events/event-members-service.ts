/**
 * PM-facing membership writes (Team & access panel + the Crew panel's tech auto-enroll).
 * Both run through Admin-SDK callables that re-assert the PM-or-admin gate server-side —
 * client-side `events/{id}/members` writes stay admin-only in firestore.rules (S8).
 * Roster READS live in @/lib/rbac/membership (`listEventMembers`).
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import type { EventRole } from '@/lib/rbac/roles';
import type {
  AssignEventMemberInput,
  AssignEventMemberOutput,
  RemoveEventMemberInput,
  RemoveEventMemberOutput,
} from '@contracts/callables/members';

/** Assign (or update) a member by email — the Team panel's add/edit path. */
export async function assignMemberByEmail(
  eventId: string,
  email: string,
  role: EventRole,
  departments?: string[],
): Promise<AssignEventMemberOutput> {
  const callable = httpsCallable<AssignEventMemberInput, AssignEventMemberOutput>(
    functions,
    'assignEventMember',
  );
  const result = await callable({ eventId, email, role, departments });
  return result.data;
}

/** Update an existing member's role/departments by uid (roster edits). */
export async function assignMemberByUid(
  eventId: string,
  uid: string,
  role: EventRole,
  departments?: string[],
): Promise<AssignEventMemberOutput> {
  const callable = httpsCallable<AssignEventMemberInput, AssignEventMemberOutput>(
    functions,
    'assignEventMember',
  );
  const result = await callable({ eventId, uid, role, departments });
  return result.data;
}

/**
 * Crew auto-enroll: give a contact's linked account read access as `tech` — a no-op when
 * they're already a member of any role (never downgrades a PM/department-lead).
 */
export async function enrollTechIfAbsent(
  eventId: string,
  uid: string,
): Promise<AssignEventMemberOutput> {
  const callable = httpsCallable<AssignEventMemberInput, AssignEventMemberOutput>(
    functions,
    'assignEventMember',
  );
  const result = await callable({ eventId, uid, role: 'tech', ifAbsent: true });
  return result.data;
}

/** Remove a member (the callable blocks removing yourself unless you're an admin). */
export async function removeMember(eventId: string, uid: string): Promise<RemoveEventMemberOutput> {
  const callable = httpsCallable<RemoveEventMemberInput, RemoveEventMemberOutput>(
    functions,
    'removeEventMember',
  );
  const result = await callable({ eventId, uid });
  return result.data;
}
