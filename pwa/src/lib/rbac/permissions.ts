/**
 * Canonical permission predicates — the single source of truth for "who can do
 * what" (see AGENTS.md § code discovery → "Permission checks"). Pure functions:
 * no IO, no React. They take an already-resolved `Viewer` (global admin status)
 * plus the viewer's per-event `EventRole` (or `null` if not a member), so they
 * are trivially unit-testable and mirror the logic enforced in `firestore.rules`.
 *
 * Resolve the inputs separately:
 * - `Viewer.isAdmin` comes from the `admin` custom claim (see AuthProvider).
 * - the per-event role comes from `getEventRole()` in `membership.ts`.
 */
import type { EventRole } from './roles';

/** The acting user, with their resolved global capabilities. */
export interface Viewer {
  uid: string;
  isAdmin: boolean;
  /** Global organizer claim — may create events. Optional; defaults to false. */
  isOrganizer?: boolean;
}

/** Global admin = unrestricted across every event. */
export function isAdmin(viewer: Viewer): boolean {
  return viewer.isAdmin;
}

/**
 * May create new events. Gated by a *global* capability (admin or organizer) because
 * per-event roles can't exist before the event does. On create the creator is added
 * as the event's production-manager.
 */
export function canCreateEvents(viewer: Viewer): boolean {
  return viewer.isAdmin || viewer.isOrganizer === true;
}

/** Any member (any role) can view an event; admins can view all. */
export function canViewEvent(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role !== null;
}

/** v1: production-manager has write scope; admin always. (Dept-lead write is deferred.) */
export function canEditEvent(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role === 'production-manager';
}

/** v1: production-manager + department-lead can flag/comment; admin always. */
export function canFlag(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role === 'production-manager' || role === 'department-lead';
}

/** v1: membership is admin-managed only (broader assignment scopes deferred). */
export function canManageMembers(viewer: Viewer): boolean {
  return viewer.isAdmin;
}
