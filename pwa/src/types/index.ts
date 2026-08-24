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
  /**
   * Global production-director capability (read-only oversight of every event) — set by an
   * admin, mirrored from the `productionDirector` custom claim. Legacy docs predate the field;
   * absent parses as `false` (see `users-service.ts`).
   */
  productionDirector: boolean;
  /**
   * Global production-coordinator capability (cross-event read + the four crew-logistics
   * writes — CREW_TRAVEL_LODGING_PLAN Phase 2) — set by an admin, mirrored from the
   * `productionCoordinator` custom claim. Absent parses as `false`.
   */
  productionCoordinator: boolean;
  /** App access granted by an admin. New accounts start pending (false). */
  approved: boolean;
  createdAt: Date | null;
  lastSeenAt: Date | null;
}
