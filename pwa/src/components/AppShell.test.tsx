/**
 * AppShell navigation — the role gates, the narrow-screen disclosure, and the inline row.
 *
 * Two things are being guarded here.
 *
 * 1. **The Tracker gate** (planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md § Tracker
 *    policy). Tracker is a production-management surface: admins, production directors, and
 *    anyone who is the PM of at least one event. Department leads and techs get no navigation to
 *    it. The case worth guarding hardest is the UNRESOLVED one: "am I a PM anywhere?" comes from
 *    an async membership query, so a gate that treated "not known yet" as `false` would be
 *    correct on every static assertion below and still render the link in and then yank it out.
 *
 * 2. **The two presentations** (planning/PWA_MOBILE_NAV_PLAN.md). Below 800px the header is a
 *    hamburger disclosure; at 800px and up it is the inline row. Exactly one is in the DOM at a
 *    time, selected by `useMediaQuery(INLINE_NAV_MEDIA_QUERY)`.
 *
 * **Viewport control.** `src/testing/setup.ts` shims `matchMedia` to always report
 * `matches: false`, i.e. the NARROW presentation — so that is the default for every test here
 * and Tracker now lives inside the panel, which has to be opened first. Tests that need the
 * inline row set `media.matches = true` *before* rendering; tests that need a breakpoint
 * *crossing* call `crossBreakpoint()`, which fires a real `change` event at the hook. The
 * project has no `@testing-library/user-event`, so interactions use `fireEvent`; where the
 * distinction matters (the trigger's own click vs. the outside-click listener) both `mouseDown`
 * and `click` are fired explicitly.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyEventMembership } from '@/lib/rbac/my-memberships';
import type { UserProfile } from '@/types';
import { AppShell } from './AppShell';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-1', email: 'tara@46entertainment.com' } as {
    uid: string;
    email: string | null;
  } | null,
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
  signOut: vi.fn(),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

/** `undefined` = the shared membership query hasn't resolved yet. */
const memberships = vi.hoisted(() => ({
  data: undefined as MyEventMembership[] | undefined,
}));
vi.mock('@/lib/rbac/useMyEventMemberships', () => ({
  useMyEventMemberships: () => memberships,
}));

const users = vi.hoisted(() => ({ data: [] as UserProfile[] }));
vi.mock('@/lib/users/users-service', () => ({ listUsers: vi.fn(async () => users.data) }));
// Needs the ThemeProvider and has nothing to do with navigation.
vi.mock('@/components/SystemDarkNudge', () => ({ SystemDarkNudge: () => null }));

// --- viewport -----------------------------------------------------------------------------

type ChangeListener = (event: MediaQueryListEvent) => void;

const media = { matches: false, listeners: new Set<ChangeListener>() };

function installMatchMedia() {
  media.matches = false;
  media.listeners = new Set();
  window.matchMedia = vi.fn((query: string) => {
    const list = {
      get matches() {
        return media.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => {
        media.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: ChangeListener) => {
        media.listeners.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    return list as unknown as MediaQueryList;
  });
}

/** Resize across the 800px switch and notify, the way a rotation or window drag would. */
function crossBreakpoint(matches: boolean) {
  media.matches = matches;
  act(() => {
    for (const listener of [...media.listeners]) listener({ matches } as MediaQueryListEvent);
  });
}

// --- rendering ----------------------------------------------------------------------------

/**
 * Navigating via a rendered control would also fire the outside-click listener, which would make
 * "a route change closes the panel" pass for the wrong reason. This probe hands the test a bare
 * `navigate` so route changes can be triggered with no pointer event at all.
 */
let navigateTo: ((to: string) => void) | null = null;
function NavProbe() {
  const navigate = useNavigate();
  navigateTo = (to: string) => navigate(to);
  return <p>content</p>;
}

function shellTree(client: QueryClient, initialEntries: string[]) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppShell>
          <NavProbe />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderShell(initialEntries: string[] = ['/']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(shellTree(client, initialEntries));
}

// --- queries ------------------------------------------------------------------------------

const trigger = () => screen.getByRole('button', { name: 'Main navigation' });
const queryTrigger = () => screen.queryByRole('button', { name: 'Main navigation' });
/** The disclosure panel, by the id the trigger's `aria-controls` points at. */
const panel = () => document.getElementById('app-nav-menu');
const nav = () => screen.getByRole('navigation', { name: 'Main navigation' });
const trackerLink = () => screen.queryByRole('link', { name: 'Tracker' });

/** Focus first, then click: `fireEvent.click` alone would not focus the way a real tap does. */
function openMenu(): HTMLElement {
  const button = trigger();
  button.focus();
  fireEvent.click(button);
  return button;
}

/** Hrefs are unambiguous where accessible names are not (the Admin badge rewrites its label). */
function navHrefs(): (string | null)[] {
  return within(nav())
    .getAllByRole('link')
    .map((el) => el.getAttribute('href'));
}

const on = (role: MyEventMembership['role']): MyEventMembership[] => [{ eventId: 'event-1', role }];

function profile(uid: string, approved: boolean): UserProfile {
  return {
    uid,
    email: `${uid}@46entertainment.com`,
    displayName: null,
    isAdmin: false,
    organizer: false,
    productionDirector: false,
    approved,
    createdAt: null,
    lastSeenAt: null,
  };
}

beforeEach(() => {
  installMatchMedia();
  navigateTo = null;
  auth.user = { uid: 'user-1', email: 'tara@46entertainment.com' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  auth.signOut.mockClear();
  memberships.data = [];
  users.data = [];
});

describe('AppShell Tracker nav gate', () => {
  it('shows Tracker to an admin with no event memberships at all', () => {
    auth.isAdmin = true;
    renderShell();
    openMenu();

    expect(trackerLink()).toHaveAttribute('href', '/tracker');
  });

  it('shows Tracker to a production director with no event memberships at all', () => {
    auth.isProductionDirector = true;
    renderShell();
    openMenu();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('shows Tracker to a PM on at least one event', () => {
    memberships.data = on('production-manager');
    renderShell();
    openMenu();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('hides Tracker from a department lead', () => {
    memberships.data = on('department-lead');
    renderShell();
    openMenu();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from a tech', () => {
    memberships.data = on('tech');
    renderShell();
    openMenu();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from an organizer who is on no events', () => {
    // Organizer permits creating events, not overseeing them; creating one makes them its PM.
    auth.isOrganizer = true;
    renderShell();
    openMenu();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker while the membership summary is unresolved, then reveals it for a PM', () => {
    memberships.data = undefined;
    const { rerender } = renderShell();
    openMenu();

    // Unknown is hidden — the opposite would flash the link in and then remove it.
    expect(trackerLink()).not.toBeInTheDocument();

    memberships.data = on('production-manager');
    // Same element types, so the shell keeps its instance (and its open panel) across this.
    rerender(shellTree(new QueryClient(), ['/']));

    expect(trackerLink()).toBeInTheDocument();
  });

  it('shows Tracker to an admin immediately, without waiting on the membership query', () => {
    auth.isAdmin = true;
    memberships.data = undefined;
    renderShell();
    openMenu();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('hides Tracker when nobody is signed in', () => {
    auth.user = null;
    renderShell();
    openMenu();

    expect(trackerLink()).not.toBeInTheDocument();
    // The everyone-links stay put — this gate is about Tracker only.
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument();
  });
});

describe('AppShell narrow menu contents', () => {
  it('gives a tech only Events and Settings — no Tracker, Contacts or Documents', () => {
    memberships.data = on('tech');
    renderShell();
    openMenu();

    expect(navHrefs()).toEqual(['/events', '/settings']);
  });

  it('gives a department lead the same reduced menu', () => {
    memberships.data = on('department-lead');
    renderShell();
    openMenu();

    expect(navHrefs()).toEqual(['/events', '/settings']);
  });

  it('gives a PM Events, Tracker and Settings, but not the cross-event directories', () => {
    memberships.data = on('production-manager');
    renderShell();
    openMenu();

    expect(navHrefs()).toEqual(['/events', '/tracker', '/settings']);
  });

  it('gives an organizer the cross-event directories but no Tracker and no admin group', () => {
    auth.isOrganizer = true;
    renderShell();
    openMenu();

    expect(navHrefs()).toEqual(['/events', '/contacts', '/documents', '/settings']);
  });

  it('gives a production director Events, Tracker, Contacts, Documents and Settings', () => {
    auth.isProductionDirector = true;
    renderShell();
    openMenu();

    expect(navHrefs()).toEqual(['/events', '/tracker', '/contacts', '/documents', '/settings']);
  });

  it('gives an admin every destination, including the narrow-only template screens', () => {
    auth.isAdmin = true;
    renderShell();
    openMenu();

    expect(navHrefs()).toEqual([
      '/events',
      '/tracker',
      '/contacts',
      '/documents',
      '/admin',
      '/templates',
      '/schedule-templates',
      '/settings',
    ]);
  });

  it('carries the pending-approval badge on the Admin link, keyed by the registry id', async () => {
    auth.isAdmin = true;
    users.data = [profile('a', false), profile('b', false), profile('c', true)];
    renderShell();
    openMenu();

    const admin = await screen.findByRole('link', { name: 'Admin — 2 awaiting approval' });
    expect(admin).toHaveAttribute('href', '/admin');
    expect(within(admin).getByText('2')).toBeInTheDocument();
  });

  it('ends the account group with the email as a non-interactive span, then Sign out', () => {
    renderShell();
    openMenu();

    const items = within(nav()).getAllByRole('listitem');
    const tail = items.slice(-3);
    expect(within(tail[0]).getByRole('link')).toHaveAttribute('href', '/settings');

    const email = screen.getByText('tara@46entertainment.com');
    expect(email.tagName).toBe('SPAN');
    expect(tail[1]).toContainElement(email);
    expect(within(tail[2]).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    // Separators are CSS only: the list holds exactly the links plus email and Sign out, so no
    // item is a group heading in disguise.
    expect(items).toHaveLength(within(nav()).getAllByRole('link').length + 2);
  });

  it('signs out from the panel', () => {
    renderShell();
    openMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('omits the account identity block when nobody is signed in', () => {
    auth.user = null;
    renderShell();
    openMenu();

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByText('tara@46entertainment.com')).not.toBeInTheDocument();
  });
});

describe('AppShell disclosure behaviour', () => {
  it('starts closed, with a trigger that describes the panel it controls', () => {
    renderShell();

    const button = trigger();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'app-nav-menu');
    expect(button).toHaveAttribute('type', 'button');
    expect(panel()).toBeNull();
    // Disclosure, not a menu — no application-menu semantics anywhere in this header.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens and closes on the trigger, without double-toggling from the outside-click listener', () => {
    renderShell();
    const button = trigger();

    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(panel()).not.toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // If the outside-click listener did not exclude the trigger, this would close-then-reopen.
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(panel()).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves focus on the trigger when opening, so the next Tab reaches the first link', () => {
    renderShell();
    const button = openMenu();

    expect(button).toHaveFocus();
    // No focus trap and no autofocus: nothing inside the panel has stolen focus.
    expect(within(nav()).getAllByRole('link')[0]).not.toHaveFocus();
  });

  it('closes on Escape from anywhere and returns focus to the trigger', () => {
    renderShell();
    const button = openMenu();
    const firstLink = within(nav()).getAllByRole('link')[0];
    firstLink.focus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(panel()).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes on a pointer outside the panel', () => {
    renderShell();
    openMenu();

    fireEvent.mouseDown(screen.getByText('content'));

    expect(panel()).toBeNull();
  });

  it('stays open for a pointer inside the panel', () => {
    renderShell();
    openMenu();

    fireEvent.mouseDown(within(nav()).getAllByRole('link')[0]);

    expect(panel()).not.toBeNull();
  });

  it('closes on a route change, including search-only and hash-only changes', () => {
    renderShell(['/events']);

    openMenu();
    act(() => navigateTo?.('/events?tab=past'));
    expect(panel()).toBeNull();

    openMenu();
    act(() => navigateTo?.('/events?tab=past#crew'));
    expect(panel()).toBeNull();

    openMenu();
    act(() => navigateTo?.('/contacts'));
    expect(panel()).toBeNull();
  });

  it('clears open state when the viewport crosses the breakpoint and comes back', () => {
    renderShell();
    openMenu();
    expect(panel()).not.toBeNull();

    crossBreakpoint(true);
    expect(queryTrigger()).not.toBeInTheDocument();
    expect(panel()).toBeNull();

    // Rotating back to narrow must not resurrect the panel the user left open.
    crossBreakpoint(false);
    expect(panel()).toBeNull();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('meets the 44px touch target rule on the trigger, the brand link and every panel row', () => {
    auth.isAdmin = true;
    renderShell();
    const button = openMenu();

    expect(button.className).toContain('min-h-11');
    expect(button.className).toContain('min-w-11');
    // The glyph itself carries no accessible name — the button's aria-label does.
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: '46 Advance — home' }).className).toContain('min-h-11');

    const interactive = [
      ...within(nav()).getAllByRole('link'),
      ...within(nav()).getAllByRole('button'),
    ];
    expect(interactive.length).toBeGreaterThan(0);
    for (const el of interactive) expect(el.className).toContain('min-h-11');
  });

  it('anchors the panel as a scrollable overlay rather than pushing page content down', () => {
    renderShell();
    openMenu();

    const overlay = panel();
    expect(overlay?.className).toContain('absolute');
    expect(overlay?.className).toContain('overflow-y-auto');
    expect(overlay?.className).toContain('overscroll-contain');
    // Sign out must stay reachable in landscape, so the cap is on the panel, not the header.
    expect(overlay?.className).toContain('max-h-[calc(100dvh-5.5rem)]');
  });
});

describe('AppShell active destination', () => {
  it('marks the current destination with aria-current="page"', () => {
    renderShell(['/events']);
    openMenu();

    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  it('keeps a parent destination current on a descendant route', () => {
    renderShell(['/events/event-1/schedule']);
    openMenu();

    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('AppShell inline presentation', () => {
  beforeEach(() => {
    media.matches = true;
  });

  it('renders the inline row with no trigger and no panel at 800px and up', () => {
    auth.isAdmin = true;
    renderShell();

    // Tracker and the template screens are narrow-only: the inline row is already 750px wide.
    expect(navHrefs()).toEqual(['/events', '/contacts', '/documents', '/admin', '/settings']);
    expect(queryTrigger()).not.toBeInTheDocument();
    expect(panel()).toBeNull();
  });

  it('applies the same role policy as the panel', () => {
    memberships.data = on('tech');
    renderShell();

    expect(navHrefs()).toEqual(['/events', '/settings']);
  });

  it('caps the email at 160px and follows it with Sign out', () => {
    renderShell();

    const email = screen.getByText('tara@46entertainment.com');
    expect(email.tagName).toBe('SPAN');
    // 160px, not max-w-[12rem] (192px) — a wider identity slot is what overflowed the row.
    expect(email.className).toContain('max-w-40');
    expect(email.className).toContain('truncate');
    expect(email.className).toContain('min-w-0');
    expect(email.compareDocumentPosition(screen.getByRole('button', { name: 'Sign out' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('exposes exactly one navigation landmark', () => {
    renderShell();

    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(1);
  });

  it('keeps the Admin pill and its badge in the inline row', async () => {
    auth.isAdmin = true;
    users.data = [profile('a', false)];
    renderShell();

    const admin = await screen.findByRole('link', { name: 'Admin — 1 awaiting approval' });
    expect(admin.className).toContain('bg-accent');
    expect(within(admin).getByText('1')).toBeInTheDocument();
  });
});
