/**
 * Canonical TypeScript definitions live here (see AGENTS.md § Code Discovery).
 * Domain types (events, advances, roles, etc.) are added in Phase 1+.
 */

/** A user account profile — `users/{uid}`, written server-side by syncUserClaims. */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  /** Global organizer capability (may create events) — set by an admin. */
  organizer: boolean;
  /** App access granted by an admin. New accounts start pending (false). */
  approved: boolean;
  createdAt: Date | null;
  lastSeenAt: Date | null;
}
