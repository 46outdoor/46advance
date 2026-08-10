/**
 * App navigation registry (planning/PWA_MOBILE_NAV_PLAN.md).
 *
 * Nav links used to be hardcoded inline in `AppShell.tsx`, which is exactly how the Tracker
 * and template screens drifted out of the nav in the first place. Both presentations — the
 * narrow-screen disclosure and the inline row above the breakpoint — filter and render from this
 * one list, so a destination cannot exist in one and be forgotten in the other.
 *
 * Lives in `lib/` rather than `components/` for the same reason `lib/admin/tabs.ts` does: it
 * is shared data with no React dependency, and a feature may never import from another feature.
 *
 * ⚠ VISIBILITY IS PRESENTATION, NOT ACCESS CONTROL. Hiding a link does not protect a route.
 * `Events` and `Tracker` are genuinely scoped (membership-scoped queries plus route guards),
 * but `contacts/{id}` and `artistDocuments/{id}` are still `allow read: if isActiveUser()` —
 * any approved user can reach them by typing the URL. Tightening that is a rules change,
 * tracked as IDEAS §5.
 */
import { canViewTracker, type Viewer } from '@/lib/rbac/permissions';

/** Which presentation(s) render an item. Always explicit — never inferred from a default. */
export type NavPlacement = 'narrow' | 'inline';

/**
 * Who sees an item.
 * - `all` — every signed-in user.
 * - `pm-or-oversight` — admin, production director, or a PM on ≥1 event. Delegates to
 *   `canViewTracker`; see `resolveNavVisibility`.
 * - `cross-event` — admin, organizer, or production director. Cross-event directories.
 * - `admin` — admin only; all of these routes also sit behind `AdminGate` in `App.tsx`.
 */
export type NavVisibility = 'all' | 'pm-or-oversight' | 'cross-event' | 'admin';

export type NavGroup = 'destinations' | 'admin' | 'account';

export interface NavItem {
  /** Stable id — runtime decoration (e.g. the Admin pending badge) keys off this, not the label. */
  id: string;
  to: string;
  label: string;
  group: NavGroup;
  visibility: NavVisibility;
  placements: readonly NavPlacement[];
}

const BOTH = ['narrow', 'inline'] as const;
const NARROW_ONLY = ['narrow'] as const;

/**
 * Every destination link in the app chrome, in render order within each group.
 *
 * Tracker, Templates, and Schedule templates are `narrow` only: adding them to the inline row
 * would push it past roughly 1050px. Surfacing them at every width means an overflow
 * disclosure on desktop too — deliberately deferred (plan § Out of scope).
 *
 * The account group holds Settings only. The email label and Sign out are runtime account
 * content, not destinations, and are rendered after this group's links.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'events',
    to: '/events',
    label: 'Events',
    group: 'destinations',
    visibility: 'all',
    placements: BOTH,
  },
  {
    id: 'tracker',
    to: '/tracker',
    label: 'Tracker',
    group: 'destinations',
    visibility: 'pm-or-oversight',
    placements: NARROW_ONLY,
  },
  {
    id: 'contacts',
    to: '/contacts',
    label: 'Contacts',
    group: 'destinations',
    visibility: 'cross-event',
    placements: BOTH,
  },
  {
    id: 'documents',
    to: '/documents',
    label: 'Documents',
    group: 'destinations',
    visibility: 'cross-event',
    placements: BOTH,
  },
  {
    id: 'admin',
    to: '/admin',
    label: 'Admin',
    group: 'admin',
    visibility: 'admin',
    placements: BOTH,
  },
  {
    id: 'templates',
    to: '/templates',
    label: 'Templates',
    group: 'admin',
    visibility: 'admin',
    placements: NARROW_ONLY,
  },
  {
    id: 'schedule-templates',
    to: '/schedule-templates',
    label: 'Schedule templates',
    group: 'admin',
    visibility: 'admin',
    placements: NARROW_ONLY,
  },
  {
    id: 'settings',
    to: '/settings',
    label: 'Settings',
    group: 'account',
    visibility: 'all',
    placements: BOTH,
  },
] as const;

/**
 * "Is this viewer a production manager on at least one event?" — a TRI-STATE.
 *
 * It resolves from an async membership query, so `undefined` means "not known yet". The
 * resolver takes it as an explicit argument rather than reading the query itself, which keeps
 * this module pure and makes the loading policy directly testable.
 */
export type PmSomewhere = boolean | undefined;

/**
 * Resolve one visibility value for a viewer.
 *
 * `pm-or-oversight` delegates to `canViewTracker` rather than restating
 * `isAdmin || isProductionDirector || isPmSomewhere`. That predicate already backs the two
 * Tracker route guards and the in-screen Tracker links; a fourth copy here is precisely the
 * drift this registry exists to prevent. Unknown resolves to hidden, so the link never flashes
 * in and then disappears once the query settles.
 *
 * `cross-event` is the one genuinely nav-local rule — it has no rules counterpart (see the
 * warning at the top of this file), so it is not named like a Firestore permission and does
 * not reuse the semantically unrelated `canCreateEvents`.
 */
export function resolveNavVisibility(
  visibility: NavVisibility,
  viewer: Viewer,
  isPmSomewhere: PmSomewhere,
): boolean {
  switch (visibility) {
    case 'all':
      return true;
    case 'pm-or-oversight':
      return canViewTracker(viewer, isPmSomewhere);
    case 'cross-event':
      return viewer.isAdmin || viewer.isOrganizer === true || viewer.isProductionDirector === true;
    case 'admin':
      return viewer.isAdmin;
  }
}

/** The items one presentation shows this viewer, in registry order. */
export function visibleNavItems(
  placement: NavPlacement,
  viewer: Viewer,
  isPmSomewhere: PmSomewhere,
): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.placements.includes(placement) &&
      resolveNavVisibility(item.visibility, viewer, isPmSomewhere),
  );
}

/** The items of one group within one presentation — how each rendered section is built. */
export function visibleNavGroup(
  group: NavGroup,
  placement: NavPlacement,
  viewer: Viewer,
  isPmSomewhere: PmSomewhere,
): NavItem[] {
  return visibleNavItems(placement, viewer, isPmSomewhere).filter((item) => item.group === group);
}

/**
 * The inline/narrow switch. The CSS breakpoint and the `matchMedia` query that clears open
 * menu state MUST stay identical, so both read this one constant.
 *
 * **880px — re-measured 2026-08-10, up from the 800px the plan specified.** The plan derived
 * 800 from a 750px row and rejected the named `md:` (768px) for leaving "only 18px" of
 * tolerance. That reasoning then condemned 800 itself, because the 44px touch targets widened
 * the row after the fact: the Admin pill went `px-1.5`→`px-3` and Sign out `px-2`→`px-3`.
 *
 * Measured in Chromium with an admin (the worst case — most items, plus the pending badge) and
 * the identity span at its full `max-w-40` cap: brand 120 + nav 636 + 32 header padding =
 * **788px**. At an 800px breakpoint that is 12px of slack, which held on macOS and wrapped on
 * Linux CI, where the row silently grew a second line (the nav is `flex-wrap`, so it never
 * overflows — it wraps, which is the whole failure this design exists to remove).
 *
 * 880 leaves ~92px, comfortably past cross-platform font-metric variance. Raising the
 * breakpoint rather than trimming the padding keeps the 44px targets intact; the identity cap
 * stays at `max-w-40` so the address is still readable.
 */
export const INLINE_NAV_MIN_WIDTH = 880;
export const INLINE_NAV_MEDIA_QUERY = `(min-width: ${INLINE_NAV_MIN_WIDTH}px)`;
