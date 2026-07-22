/**
 * New-user approval helpers. A registered account is blocked from app access until an admin
 * approves it (backend-enforced in firestore.rules + the callable `assertActiveUser`). Admins are
 * implicitly active, so they're never "pending". These pure predicates back the Admin pending-approval
 * section and the nav count badge, so both agree on who's waiting.
 */
import type { UserProfile } from '@/types';

type ApprovalFields = Pick<UserProfile, 'isAdmin' | 'approved'>;

/** A non-admin account that hasn't been approved yet (awaiting an admin's decision). */
export function isPendingApproval(user: ApprovalFields): boolean {
  return !user.isAdmin && !user.approved;
}

/** How many of `users` are awaiting approval. */
export function countPendingApproval(users: readonly ApprovalFields[]): number {
  return users.reduce((n, u) => (isPendingApproval(u) ? n + 1 : n), 0);
}
