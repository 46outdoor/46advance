/**
 * Per-event membership callables — assignEventMember / removeEventMember.
 *
 * Client-side, `events/{id}/members` writes stay global-admin-only in firestore.rules
 * (S8: no self-bootstrap). These callables are the PM-facing path: they run on the
 * Admin SDK and re-assert the PM-or-admin gate (`assertCanEditEvent`) server-side, so
 * an event's production manager can designate a co-PM, department editors, or techs
 * without global admin rights.
 *
 * Guards:
 * - Non-admin callers can never change or remove their OWN membership — so an event
 *   always keeps at least one production manager (you can't demote or delete yourself).
 * - The target must be an approved account (fail-closed on the server-owned users/{uid}
 *   record, mirroring assertActiveUser).
 * - `departments` (department-lead only) must be among the event's enabled departments.
 */
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import {
  getFirestore,
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertCanEditEvent } from './google.js';
import { assertActiveUser } from './lib/auth/authorize.js';
import { enforceRateLimit } from './lib/security/firestoreRateLimit.js';
import { parseCallableData } from './lib/parseCallable.js';
import { resolveDisplayName } from './lib/auth/displayName.js';
import {
  assignEventMemberInputSchema,
  removeEventMemberInputSchema,
  type AssignEventMemberOutput,
  type RemoveEventMemberOutput,
} from './contracts/callables/members.js';

/** Look up the target account by uid or email; `not-found` (never `internal`) when absent. */
async function resolveTargetUser(target: { uid?: string; email?: string }): Promise<UserRecord> {
  try {
    return target.uid
      ? await getAuth().getUser(target.uid)
      : await getAuth().getUserByEmail(target.email ?? '');
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      throw new HttpsError(
        'not-found',
        target.uid
          ? 'No account found for that user.'
          : 'No account found for that email. They need to register (and be approved) first.',
      );
    }
    throw err;
  }
}

/** Approved gate for the TARGET account (no token available): admins always pass; everyone
 *  else needs the server-owned users/{uid} record to say approved — missing doc = revoked. */
function isTargetApproved(userRecord: UserRecord, userSnap: DocumentSnapshot): boolean {
  if (userRecord.customClaims?.admin === true) return true;
  return userSnap.exists && userSnap.get('approved') === true;
}

export const assignEventMember = onCall(async (request): Promise<AssignEventMemberOutput> => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const input = parseCallableData(assignEventMemberInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['assignEventMember', uid], 30);
  // Production coordinator (CREW_TRAVEL_LODGING_PLAN §5.3): managing the crew roster implies
  // the Tech auto-enroll that attaching fires, so the claim gets EXACTLY that — the parsed
  // request must be role 'tech' with ifAbsent, the no-op-if-any-membership-exists path that
  // can never assign authority or alter an existing membership. Everything else (role
  // assignment, edits, removal) still requires assertCanEditEvent, which this claim never
  // satisfies.
  const coordinatorAutoEnroll =
    token.productionCoordinator === true && input.role === 'tech' && input.ifAbsent === true;
  if (!coordinatorAutoEnroll) {
    await assertCanEditEvent(db, token, uid, input.eventId);
  } else {
    await assertActiveUser({ uid, token });
  }

  const eventSnap = await db.doc(`events/${input.eventId}`).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');

  const userRecord = await resolveTargetUser(input);
  const targetUid = userRecord.uid;
  const memberRef = db.doc(`events/${input.eventId}/members/${targetUid}`);
  const existing = await memberRef.get();

  // Crew auto-enroll: never touch an existing membership (attaching a contact as crew must
  // not downgrade a PM or department lead to tech).
  if (input.ifAbsent && existing.exists) {
    return { uid: targetUid, role: existing.get('role'), updated: false };
  }
  if (targetUid === uid && token.admin !== true) {
    throw new HttpsError('failed-precondition', 'You can’t change your own membership.');
  }

  const userSnap = await db.doc(`users/${targetUid}`).get();
  if (!isTargetApproved(userRecord, userSnap)) {
    throw new HttpsError('failed-precondition', 'That account isn’t approved for app access yet.');
  }

  const data: DocumentData = {
    role: input.role,
    addedBy: uid,
    addedAt: FieldValue.serverTimestamp(),
    uid: targetUid, // mirrors the doc id for the collectionGroup('members') events-list query
    // Denormalized for the Team roster (non-admin PMs can't read the users directory).
    email: userRecord.email ?? null,
    displayName: resolveDisplayName(userSnap.get('displayName'), userRecord.displayName, null),
  };
  if (input.role === 'department-lead') {
    const enabled: string[] = (eventSnap.get('departmentIds') as string[] | undefined) ?? [];
    const departments = input.departments ?? [];
    const unknown = departments.filter((d) => !enabled.includes(d));
    if (unknown.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Not an enabled department on this event: ${unknown.join(', ')}.`,
      );
    }
    data.departments = departments;
  }
  await memberRef.set(data);
  return { uid: targetUid, role: input.role, updated: true };
});

export const removeEventMember = onCall(async (request): Promise<RemoveEventMemberOutput> => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { uid, token } = request.auth;
  const input = parseCallableData(removeEventMemberInputSchema, request.data);
  const db = getFirestore();
  await enforceRateLimit(db, ['removeEventMember', uid], 30);
  await assertCanEditEvent(db, token, uid, input.eventId);

  if (input.uid === uid && token.admin !== true) {
    throw new HttpsError('failed-precondition', 'You can’t remove yourself from the event.');
  }
  const memberRef = db.doc(`events/${input.eventId}/members/${input.uid}`);
  const existing = await memberRef.get();
  if (!existing.exists) return { removed: false };
  await memberRef.delete();
  return { removed: true };
});
