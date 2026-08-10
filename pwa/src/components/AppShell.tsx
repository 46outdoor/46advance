/**
 * App frame: dark, branded chrome (sticky header that shrinks on scroll) + light content.
 *
 * The header has TWO navigation presentations and renders **exactly one at a time**, chosen in
 * JavaScript by `useMediaQuery(INLINE_NAV_MEDIA_QUERY)` rather than by Tailwind `hidden`
 * variants (a deliberate refinement of planning/PWA_MOBILE_NAV_PLAN.md, which assumed
 * `min-[800px]:`). Two `<nav>` landmarks both named "Main navigation" is an accessibility
 * defect even when one is visually hidden, and jsdom applies no Tailwind, so a CSS-hidden
 * duplicate would make every component-test query in this file's tests ambiguous.
 *
 *   below 800px — brand + a hamburger **disclosure** carrying navigation *and* identity
 *   800px and up — the inline row, unchanged in shape
 *
 * Both presentations filter `src/lib/nav/items.ts`, so a destination cannot be added to one and
 * forgotten in the other — the drift that hid Tracker and the template screens for months.
 *
 * The disclosure is a disclosure, not a menu: `<button aria-expanded aria-controls>` toggling a
 * `<nav>` of links. No `role="menu"`, no roving tabindex, no focus trap, no scroll lock — it is
 * non-modal, so Tab must be able to leave it. (`AdminTabBar` is a tablist; do not copy it here.)
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useScrolled } from '@/hooks/useScrolled';
import { SystemDarkNudge } from '@/components/SystemDarkNudge';
import {
  INLINE_NAV_MEDIA_QUERY,
  visibleNavGroup,
  visibleNavItems,
  type NavGroup,
  type NavItem,
} from '@/lib/nav/items';
import type { Viewer } from '@/lib/rbac/permissions';
import { isProductionManagerSomewhere } from '@/lib/rbac/my-memberships';
import { useMyEventMemberships } from '@/lib/rbac/useMyEventMemberships';
import { listUsers } from '@/lib/users/users-service';
import { countPendingApproval } from '@/lib/users/approval';

/** The panel's element id. The trigger's `aria-controls` must keep pointing at it. */
const NAV_MENU_ID = 'app-nav-menu';
/** One accessible name for the navigation, on whichever presentation is mounted. */
const NAV_LABEL = 'Main navigation';

/** Panel groups, in render order. Separators between them are CSS only — never list items. */
const PANEL_GROUPS: readonly NavGroup[] = ['destinations', 'admin', 'account'];

/**
 * 44px minimum touch targets (AGENTS.md § Responsive design) belong on the interactive element
 * itself, not on its `<li>` — a tall list item with a 20px link inside is still a 20px target.
 */
const PANEL_ROW = 'flex min-h-11 items-center rounded px-3 text-sm transition-colors';
const INLINE_ROW = 'inline-flex min-h-11 items-center transition-colors';
/** Presentational group separator: a rule above the first row of every group after the first. */
const GROUP_START = 'mt-1 border-t border-brand-fg/15 pt-1';

/** `accent-deep`, not `accent`: this is 9.6px white text on a filled swatch, which WCAG counts
 * as small text and holds to 4.5:1. The signature #f04040 is 3.81:1 against white — see the
 * token's comment in `index.css`. The count badge inverts the same pair for the same reason. */
const ADMIN_PILL =
  'min-h-11 items-center gap-1 rounded bg-accent-deep px-3 text-[0.6rem] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90';
const INLINE_ADMIN = `inline-flex ${ADMIN_PILL}`;
const PANEL_ADMIN = `flex justify-between ${ADMIN_PILL}`;

const SIGN_OUT_BASE =
  'min-h-11 items-center rounded border border-brand-fg/30 px-3 text-xs transition-colors hover:border-accent hover:text-accent';

/** `end` is left at its default `false` so a parent destination stays current on descendants. */
function rowClass(base: string) {
  return ({ isActive }: { isActive: boolean }) =>
    `${base} ${isActive ? 'text-accent' : 'hover:text-accent'}`;
}

/**
 * The Admin link: accent pill plus the pending-approval count, a standing nudge that new
 * registrations need action. Keyed by the registry id `admin`, never by the label.
 */
function AdminNavLink({
  item,
  pendingCount,
  className,
}: {
  item: NavItem;
  pendingCount: number;
  className: string;
}) {
  return (
    <NavLink
      to={item.to}
      className={className}
      aria-label={
        pendingCount > 0 ? `${item.label} — ${pendingCount} awaiting approval` : item.label
      }
    >
      <span>{item.label}</span>
      {pendingCount > 0 && (
        <span
          className="rounded-full bg-white px-1 leading-none text-accent-deep"
          title={`${pendingCount} account${pendingCount === 1 ? '' : 's'} awaiting approval`}
        >
          {pendingCount}
        </span>
      )}
    </NavLink>
  );
}

/** One registry item, rendered for whichever presentation asked for it. */
function NavItemLink({
  item,
  pendingCount,
  rowBase,
  adminClassName,
}: {
  item: NavItem;
  pendingCount: number;
  rowBase: string;
  adminClassName: string;
}) {
  if (item.id === 'admin') {
    return <AdminNavLink item={item} pendingCount={pendingCount} className={adminClassName} />;
  }
  return (
    <NavLink to={item.to} className={rowClass(rowBase)}>
      {item.label}
    </NavLink>
  );
}

function SignOutButton({ className, onSignOut }: { className: string; onSignOut: () => void }) {
  return (
    <button type="button" onClick={onSignOut} className={className}>
      Sign out
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // Thresholds live in the hook — they're tied to how far this header collapses (see its header).
  const scrolled = useScrolled();
  const { user, isAdmin, isOrganizer, isProductionDirector, signOut } = useAuth();
  const inline = useMediaQuery(INLINE_NAV_MEDIA_QUERY);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Admins see a count of accounts awaiting approval on the Admin link — a standing nudge that new
  // registrations need action, without opening the Admin screen. Shares the ['admin','users'] cache.
  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
    enabled: isAdmin,
  });
  const pendingCount = usersQuery.data ? countPendingApproval(usersQuery.data) : 0;

  // Tracker is for the people accountable for completion: oversight (admin / production
  // director) plus anyone who production-manages at least one event. The membership summary is
  // a TRI-STATE — `undefined` while the shared query resolves — and the registry's
  // `pm-or-oversight` rule (which delegates to `canViewTracker`) treats "unknown" as hidden, so
  // the link never flashes in and then disappears.
  const memberships = useMyEventMemberships();
  const isPmSomewhere = isProductionManagerSomewhere(memberships.data);
  // Signed out, the viewer holds no capability at all: the shell only mounts inside
  // ProtectedLayout, but the registry must not hand a null user cross-event or Tracker links.
  const viewer: Viewer = user
    ? { uid: user.uid, isAdmin, isOrganizer, isProductionDirector }
    : { uid: '', isAdmin: false, isOrganizer: false, isProductionDirector: false };

  const inlineItems = visibleNavItems('inline', viewer, isPmSomewhere);
  const panelGroups = PANEL_GROUPS.map((group) =>
    visibleNavGroup(group, 'narrow', viewer, isPmSomewhere),
  ).filter((items) => items.length > 0);

  // A route change closes the panel. Easy to miss: this shell persists across every protected
  // route, so React never remounts it — and search/hash-only changes are navigations too.
  const routeKey = `${location.pathname}${location.search}${location.hash}`;
  useEffect(() => {
    setOpen(false);
  }, [routeKey]);

  // Crossing the breakpoint clears the state as well, so rotating back to narrow cannot
  // resurrect a panel the user last saw on a phone in portrait.
  useEffect(() => {
    setOpen(false);
  }, [inline]);

  useEffect(() => {
    if (!open) return;
    // Escape closes from anywhere while open and returns focus to the trigger — the disclosure's
    // one focus-management obligation. Opening deliberately leaves focus where it is, so the
    // next Tab reaches the first link.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    // Outside click/tap closes. The trigger is excluded so its own click still toggles once.
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const onSignOut = () => {
    void signOut();
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header
        className={`sticky top-0 z-30 bg-brand text-brand-fg transition-[padding,box-shadow] duration-300 ${
          scrolled ? 'py-2 shadow-lg shadow-black/30' : 'py-5'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center px-4">
          {/* The mark shrinks to 32px when the header collapses; below 800px the link itself
              still has to clear 44px. */}
          <Link
            to="/"
            className={`inline-flex items-end gap-0.5 ${inline ? '' : 'min-h-11'}`}
            aria-label="46 Advance — home"
          >
            <img
              src="/brand/46-mark-white.png"
              alt=""
              aria-hidden="true"
              className={`w-auto transition-all duration-300 ${scrolled ? 'h-8' : 'h-12'}`}
            />
            <span
              className={`font-sans font-normal uppercase leading-none text-brand-fg transition-all duration-300 ${
                scrolled
                  ? 'pb-1.5 text-[0.575rem] tracking-[0.15em]'
                  : 'pb-2.5 text-xs tracking-[0.15em]'
              }`}
            >
              Advance
            </span>
          </Link>
          {inline ? (
            <nav
              aria-label={NAV_LABEL}
              className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm"
            >
              {inlineItems.map((item) => (
                <NavItemLink
                  key={item.id}
                  item={item}
                  pendingCount={pendingCount}
                  rowBase={INLINE_ROW}
                  adminClassName={INLINE_ADMIN}
                />
              ))}
              {user && (
                <>
                  {/* 160px, not `max-w-[12rem]` (192px): the measured inline row already needs
                      750px, and a wider identity slot is what pushed it past the breakpoint.
                      The full address stays the text content for assistive technology. */}
                  <span className="inline-block min-w-0 max-w-40 truncate text-xs text-brand-fg/60">
                    {user.email}
                  </span>
                  <SignOutButton className={`inline-flex ${SIGN_OUT_BASE}`} onSignOut={onSignOut} />
                </>
              )}
            </nav>
          ) : (
            <button
              ref={triggerRef}
              type="button"
              aria-label={NAV_LABEL}
              aria-expanded={open}
              aria-controls={NAV_MENU_ID}
              onClick={() => setOpen((wasOpen) => !wasOpen)}
              className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded transition-colors hover:text-accent"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          )}
        </div>
        {/* An overlay anchored below the sticky header, so opening it never pushes page content
            down or moves the header's scroll thresholds. Capped to the dynamic viewport and
            scrollable, so Sign out stays reachable on a phone in landscape. */}
        {!inline && open && (
          <nav
            ref={panelRef}
            id={NAV_MENU_ID}
            aria-label={NAV_LABEL}
            className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain border-t border-brand-fg/15 bg-brand shadow-lg shadow-black/40"
          >
            <ul className="mx-auto max-w-6xl px-4 py-2">
              {panelGroups.map((items, groupIndex) =>
                items.map((item, itemIndex) => (
                  <li
                    key={item.id}
                    className={groupIndex > 0 && itemIndex === 0 ? GROUP_START : undefined}
                  >
                    <NavItemLink
                      item={item}
                      pendingCount={pendingCount}
                      rowBase={PANEL_ROW}
                      adminClassName={PANEL_ADMIN}
                    />
                  </li>
                )),
              )}
              {user && (
                <>
                  <li>
                    <span className="block min-w-0 truncate px-3 py-1 text-xs text-brand-fg/60">
                      {user.email}
                    </span>
                  </li>
                  <li>
                    <SignOutButton
                      className={`flex w-full justify-center ${SIGN_OUT_BASE}`}
                      onSignOut={onSignOut}
                    />
                  </li>
                </>
              )}
            </ul>
          </nav>
        )}
      </header>
      <SystemDarkNudge />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-ink-muted">
        <Link to="/privacy" className="hover:text-accent">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
