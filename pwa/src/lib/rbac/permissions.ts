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
   * Global production-director claim — oversight of EVERY event, whether or not the user is a
   * member. Over event data it is READ-ONLY: a director who must edit a show is assigned that
   * event's production-manager role, and the event write predicates below stay
   * membership-based. The one write it carries is global contacts-directory curation
   * (`canManageContact`), which is not event authority. Optional; defaults to false.
   */
  isProductionDirector?: boolean;
  /**
   * Global production-coordinator claim (CREW_TRAVEL_LODGING_PLAN Phase 2): joins the
   * cross-event READ population (§2.1 #2, resolved 2026-08-21 — threat-model cost accepted),
   * and carries exactly four writes: crew logistics, the crew roster, the contacts
   * directory, and schedule days. Every other event write predicate ignores it.
   * Optional; defaults to false.
   */
  isProductionCoordinator?: boolean;
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
  return (
    viewer.isAdmin ||
    viewer.isProductionDirector === true ||
    viewer.isProductionCoordinator === true
  );
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

/** The contact fields this predicate needs (subset of `Contact`). */
export interface ContactOwnership {
  /** uid of whoever created the directory entry. */
  createdBy: string;
}

/**
 * May edit or delete an entry in the GLOBAL contacts directory. Admin and production director
 * curate the whole directory; everyone else manages only what they created.
 *
 * Mirrors the `contacts/{contactId}` update/delete gates in `firestore.rules`, with one
 * deliberate narrowing: the rules also let a user update the entry LINKED to their own account
 * (`userId`), because that is how a profile photo is saved from Settings. The directory screen
 * does not offer that as an edit affordance, so this predicate leaves it out — keeping the UI
 * stricter than the rules is safe; the reverse would not be.
 *
 * Note this is the director claim's only write. It is directory curation, not event authority:
 * `canEditEvent` and every other event write predicate still ignore the claim.
 */
export function canManageContact(viewer: Viewer, contact: ContactOwnership): boolean {
  return (
    viewer.isAdmin ||
    viewer.isProductionDirector === true ||
    viewer.isProductionCoordinator === true ||
    contact.createdBy === viewer.uid
  );
}

/**
 * May manage the event's member roster (assign/remove roles): admin or the event's
 * production manager. Enforced server-side by the assignEventMember/removeEventMember
 * callables (`assertCanEditEvent`); this predicate is the UI mirror.
 */
export function canManageMembers(viewer: Viewer, role: EventRole | null): boolean {
  return viewer.isAdmin || role === 'production-manager';
}

/**
 * May create/edit/delete crew travel & lodging records on an event
 * (planning/CREW_TRAVEL_LODGING_PLAN.md §4.6). Phase 1: admin or the event's PM — the same
 * population as `canEditEvent`, but deliberately its OWN predicate so the Production
 * Coordinator capability (Phase 2) widens one function body instead of sweeping call sites.
 * Named for the capability, never the claim that grants it.
 */
export function canManageCrewLogistics(viewer: Viewer, role: EventRole | null): boolean {
  return (
    viewer.isAdmin || role === 'production-manager' || viewer.isProductionCoordinator === true
  );
}

/**
 * May read EVERY crew logistics record on an event — the read superset over
 * `canManageCrewLogistics` (decision 12): a production director inspects all itineraries
 * read-only, preserving ROADMAP §4's "director reads every event subtree" contract, while the
 * director claim still carries no logistics write. Everyone else reads only records whose
 * denormalized `userId` is their own (enforced in rules; the client mirrors it by choosing the
 * uid-constrained query — see the list-query trap in plan §4.3).
 */
export function canViewAllCrewLogistics(viewer: Viewer, role: EventRole | null): boolean {
  return canManageCrewLogistics(viewer, role) || viewer.isProductionDirector === true;
}

/**
 * May curate the event's CREW roster (attach contacts, edit role labels/notes): event
 * editors, plus the production coordinator (CREW_TRAVEL_LODGING_PLAN §5.2). Distinct from
 * `canEditEvent` on purpose — the coordinator curates crew without gaining the event.
 * Detach is server-owned either way (`detachEventContact`). The Tech auto-enroll attach
 * fires is authorized server-side as exactly role=tech + ifAbsent for this claim.
 */
export function canManageCrewRoster(viewer: Viewer, role: EventRole | null): boolean {
  return (
    viewer.isAdmin || role === 'production-manager' || viewer.isProductionCoordinator === true
  );
}

/**
 * May edit schedule days (rows, day add/redate/shift, template import): event editors, plus
 * the production coordinator — arrival times they book land on the timeline directly
 * (CREW_TRAVEL_LODGING_PLAN §5.2). Mirrors the rules' `canManageScheduleDays`.
 */
export function canManageScheduleDays(viewer: Viewer, role: EventRole | null): boolean {
  return (
    viewer.isAdmin || role === 'production-manager' || viewer.isProductionCoordinator === true
  );
}
