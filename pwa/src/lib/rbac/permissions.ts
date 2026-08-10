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
  /**
   * Global production-director claim — read-only oversight of EVERY event, whether or not
   * the user is a member. Grants no writes: a director who must edit a show is assigned that
   * event's production-manager role, and the write predicates below stay membership-based.
   * Optional; defaults to false.
   */
  isProductionDirector?: boolean;
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

/**
 * Read every event without a membership row. Admin or production director — the two global
 * capabilities that see across events. Distinct from `canCreateEvents` on purpose: organizer
 * and director are different populations that merely overlap today, so keeping the predicates
 * separate means splitting them later costs one function body, not a sweep of call sites.
 */
export function canOverseeAllEvents(viewer: Viewer): boolean {
  return viewer.isAdmin || viewer.isProductionDirector === true;
}

/** v1: production-manager has write scope; admin always. (Dept-lead write is deferred.) */
export function canEditEvent(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role === 'production-manager';
}

/**
 * May read the event checklist. Mirrors `canReadChecklist` in `firestore.rules`: the PM's
 * working list stays hidden from department leads and techs, but oversight sees it read-only —
 * it is the clearest signal of whether a PM is on top of a show. Writes remain `canEditEvent`.
 */
export function canViewChecklist(viewer: Viewer, role: EventRole | null): boolean {
  return canOverseeAllEvents(viewer) || canEditEvent(viewer, role);
}

/** v1: production-manager + department-lead can flag/comment; admin always. */
export function canFlag(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role === 'production-manager' || role === 'department-lead';
}

/**
 * Tracker is a production-management surface: oversight sees every event, a PM sees the
 * events they run, and department leads / techs don't get it at all.
 *
 * This is a product boundary, not secrecy — leads and techs can already read the underlying
 * section statuses for their events and could compute the same roll-up. The point is to show
 * Tracker only to the people accountable for completion.
 *
 * `isPmSomewhere` is a TRI-STATE. It resolves from an async membership query, so `undefined`
 * means "not known yet" and must render as hidden — otherwise the link flashes in and then
 * disappears once the query settles.
 */
export function canViewTracker(viewer: Viewer, isPmSomewhere: boolean | undefined): boolean {
  return canOverseeAllEvents(viewer) || isPmSomewhere === true;
}

/** May open one event's tracker: oversight anywhere, or PM of that specific event. */
export function canViewTrackerForEvent(viewer: Viewer, role: EventRole | null): boolean {
  return canOverseeAllEvents(viewer) || role === 'production-manager';
}

/** The membership fields the department-scoped predicates need (subset of EventMember). */
export interface MemberAccess {
  role: EventRole;
  /** Department ids a department-lead may edit; absent/empty = read-only (default). */
  departments?: readonly string[];
}

/**
 * May edit one department's section (content + status) on advances and stage production
 * records: full event editors always; a department-lead only for their assigned departments.
 * Mirrors the dept-scoped write branch in `firestore.rules`.
 */
export function canEditDepartment(
  viewer: Viewer,
  member: MemberAccess | null,
  deptId: string,
): boolean {
  if (canEditEvent(viewer, member?.role ?? null)) return true;
  return member?.role === 'department-lead' && (member.departments ?? []).includes(deptId);
}

/**
 * May manage the event's member roster (assign/remove roles): admin or the event's
 * production manager. Enforced server-side by the assignEventMember/removeEventMember
 * callables (`assertCanEditEvent`); this predicate is the UI mirror.
 */
export function canManageMembers(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role === 'production-manager';
}
