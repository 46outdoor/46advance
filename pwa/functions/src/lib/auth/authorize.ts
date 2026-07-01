/**
 * Server-side authorization guards shared by the Admin-SDK callables.
 *
 * The Admin SDK bypasses Firestore security rules, so every privileged callable must
 * re-assert the same gates the rules enforce. In particular `firestore.rules` requires an
 * `approved` account (`isActiveUser()`) for ALL app access — a check the membership/role
 * gates alone don't cover. Without this, a pending or admin-revoked member could still act
 * through the callables. Call `assertApproved(token)` at the top of every resource-scoped
 * callable (admins are always approved, so admin-only callables don't need it).
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { DecodedIdToken } from 'firebase-admin/auth';

/** True when the caller holds app access — an admin, or an admin-approved user. */
export function isApprovedToken(token: DecodedIdToken): boolean {
  return token.admin === true || token.approved === true;
}

/**
 * Throw `permission-denied` unless the caller is an approved (or admin) user. Mirrors the
 * Firestore rules `isActiveUser()` gate so pending/revoked accounts can't act via callables.
 */
export function assertApproved(token: DecodedIdToken): void {
  if (!isApprovedToken(token)) {
    throw new HttpsError('permission-denied', 'Your account is not approved for access.');
  }
}
