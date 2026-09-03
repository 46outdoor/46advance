/**
 * Shared hook for the acting user's resolved GLOBAL capabilities — the one place the
 * `Viewer` literal is built.
 *
 * Every capability-aware screen used to construct this object by hand:
 *
 * ```ts
 * const viewer = { uid: user.uid, isAdmin, isOrganizer, isProductionDirector, isProductionCoordinator };
 * ```
 *
 * That is a silent-denial trap, because **every capability flag on `Viewer` is optional**.
 * Omitting one compiles cleanly and denies that whole population at that call site, with no
 * type error and no runtime warning — and it is only found by someone holding the claim
 * noticing something missing. It happened: `EventContactsPanel` carried the director but
 * never picked up the coordinator when Phase 2 added it, so a coordinator silently lost the
 * directory link (fixed with this extraction). Adding a fifth capability later means editing
 * this file, not sweeping a dozen screens.
 *
 * Returns `null` when signed out, exactly mirroring `useAuth().user`. Components that also
 * use `user` after their early-return guard must name both in it (`if (!user || !viewer)`) —
 * TypeScript narrows each independently, even though the two are always null together.
 * For the deliberate signed-out render, use {@link ANONYMOUS_VIEWER} instead of a hand-built
 * all-false object.
 *
 * The predicates that consume this live in `./permissions`; per the naming discipline in
 * ROADMAP §4 they are named for the capability, never for the claim that grants it.
 */
import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { Viewer } from './permissions';

/**
 * A viewer holding NO global capability, for rendering a signed-out (or not-yet-resolved)
 * shell that still has to call a `Viewer`-taking helper — `AppShell`'s nav registry is the
 * only such caller today, and it only ever mounts inside `ProtectedLayout`.
 *
 * ⚠ `uid` is the empty string, so never feed this to an ownership predicate that compares
 * uids (`canManageContact` matches `contact.createdBy === viewer.uid`). It is for
 * capability-only questions — nav visibility — where uid is not consulted. Prefer handling
 * the `null` from `useViewer()` wherever ownership is involved.
 */
export const ANONYMOUS_VIEWER: Viewer = Object.freeze({
  uid: '',
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
  isProductionCoordinator: false,
});

/** The signed-in user's global capabilities, or `null` when signed out. */
export function useViewer(): Viewer | null {
  const { user, isAdmin, isOrganizer, isProductionDirector, isProductionCoordinator } = useAuth();
  const uid = user?.uid;
  // Memoized so the identity is stable across renders: `viewer` is a dependency of query keys
  // (`eventsListKey`) and effects at several call sites, and a fresh object every render would
  // churn them.
  return useMemo(
    () =>
      uid === undefined
        ? null
        : { uid, isAdmin, isOrganizer, isProductionDirector, isProductionCoordinator },
    [uid, isAdmin, isOrganizer, isProductionDirector, isProductionCoordinator],
  );
}
