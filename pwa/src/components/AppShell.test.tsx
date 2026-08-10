/**
 * The Tracker nav gate (planning/archive/feature/EVENT_OVERSIGHT_ROLE_PLAN.md § Tracker policy).
 *
 * Tracker is a production-management surface: admins, production directors, and anyone who is
 * the PM of at least one event. Department leads and techs get no navigation to it.
 *
 * The case worth guarding hardest is the UNRESOLVED one: "am I a PM anywhere?" comes from an
 * async membership query, so a gate that treated "not known yet" as `false` would be correct on
 * every static assertion below and still render the link in and then yank it back out.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyEventMembership } from '@/lib/rbac/my-memberships';
import { AppShell } from './AppShell';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
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

vi.mock('@/lib/users/users-service', () => ({ listUsers: vi.fn(async () => []) }));
// Needs the ThemeProvider and has nothing to do with navigation.
vi.mock('@/components/SystemDarkNudge', () => ({ SystemDarkNudge: () => null }));

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const trackerLink = () => screen.queryByRole('link', { name: 'Tracker' });

const on = (role: MyEventMembership['role']): MyEventMembership[] => [{ eventId: 'event-1', role }];

beforeEach(() => {
  auth.user = { uid: 'user-1' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  memberships.data = [];
});

describe('AppShell Tracker nav gate', () => {
  it('shows Tracker to an admin with no event memberships at all', () => {
    auth.isAdmin = true;
    renderShell();

    expect(trackerLink()).toHaveAttribute('href', '/tracker');
  });

  it('shows Tracker to a production director with no event memberships at all', () => {
    auth.isProductionDirector = true;
    renderShell();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('shows Tracker to a PM on at least one event', () => {
    memberships.data = on('production-manager');
    renderShell();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('hides Tracker from a department lead', () => {
    memberships.data = on('department-lead');
    renderShell();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from a tech', () => {
    memberships.data = on('tech');
    renderShell();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from an organizer who is on no events', () => {
    // Organizer permits creating events, not overseeing them; creating one makes them its PM.
    auth.isOrganizer = true;
    renderShell();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker while the membership summary is unresolved, then reveals it for a PM', () => {
    memberships.data = undefined;
    const { rerender } = renderShell();

    // Unknown is hidden — the opposite would flash the link in and then remove it.
    expect(trackerLink()).not.toBeInTheDocument();

    memberships.data = on('production-manager');
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppShell>
            <p>content</p>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(trackerLink()).toBeInTheDocument();
  });

  it('shows Tracker to an admin immediately, without waiting on the membership query', () => {
    auth.isAdmin = true;
    memberships.data = undefined;
    renderShell();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('hides Tracker when nobody is signed in', () => {
    auth.user = null;
    renderShell();

    expect(trackerLink()).not.toBeInTheDocument();
    // The public links stay put — this gate is about Tracker only.
    expect(screen.getByRole('link', { name: 'Events' })).toBeInTheDocument();
  });
});
