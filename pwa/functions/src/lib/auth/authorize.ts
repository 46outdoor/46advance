/**
 * Server-side authorization guards shared by the Admin-SDK callables.
 *
 * The Admin SDK bypasses Firestore security rules, so every privileged callable must
 * re-assert the same gates the rules enforce. In particular `firestore.rules` requires an
 * `approved` account (`isActiveUser()`) for ALL app access — a check the membership/role
 * gates alone don't cover. Without this, a pending or admin-revoked member could still act
 * through the callables. Call `assertActiveUser(auth)` at the top of every resource-scoped
 * callable (it re-checks the authoritative record so revocation takes effect immediately);
 * admins are always approved, so admin-only callables (guarded by `assertAdmin`) don't need it.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';

/** True when the caller holds app access — an admin, or an admin-approved user. */
export function isApprovedToken(token: DecodedIdToken): boolean {
  return token.admin === true || token.approved === true;
}

/**
 * Throw `permission-denied` unless the caller is an approved (or admin) user. Mirrors the
 * Firestore rules `isActiveUser()` gate so pending/revoked accounts can't act via callables.
 * This is the cheap TOKEN fast-gate — it trusts the claim on the ID token, which can be up
 * to ~60 min stale after an admin revokes access. Use `assertActiveUser` when immediacy matters.
 */
export function assertApproved(token: DecodedIdToken): void {
  if (!isApprovedToken(token)) {
    throw new HttpsError('permission-denied', 'Your account is not approved for access.');
  }
}

/**
 * Authoritative active-user gate for state-changing / resource-scoped callables. The token
 * fast-gate (`assertApproved`) runs first, but a still-valid ID token carries a stale `approved`
 * claim for up to ~60 min after an admin revokes access — so this ALSO consults the server-owned
 * `users/{uid}` record (which `setUserApproved`/`deleteUser` update synchronously) and rejects a
 * revoked or deleted account immediately (F-2). Fail-closed: a missing record is treated as
 * revoked, matching the scheduled-sync predicate, so a deleted user's cached token can't act
 * during its residual lifetime either. Admins are exempt — the anti-lockout floor (a de-admined
 * owner loses the `admin` claim via ADMIN_EMAILS + resync, at which point this catches them as
 * `approved:false`). Call at the top of every resource-scoped callable in place of `assertApproved`.
 */
export async function assertActiveUser(auth: CallerAuth): Promise<void> {
  assertApproved(auth.token);
  if (auth.token.admin === true) return;
  const snap = await getFirestore().collection('users').doc(auth.uid).get();
  if (!snap.exists || snap.get('approved') === false) {
    throw new HttpsError('permission-denied', 'Your account is no longer approved for access.');
  }
}

/** The auth context on a callable request (present once the caller is signed in). */
export interface CallerAuth {
  uid: string;
  token: DecodedIdToken;
}

/**
 * Assert the caller is a signed-in **global admin** — the single gate for admin-only callables
 * (setUserApproved / setUserOrganizer / setUserDisplayName / deleteUser). Narrows `auth` to
 * non-null so the handler can use `auth.uid` afterward. Throws `unauthenticated` when not signed
 * in, `permission-denied` when the caller lacks the `admin` claim.
 */
export function assertAdmin(auth: CallerAuth | undefined): asserts auth is CallerAuth {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin only.');
}
