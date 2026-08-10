/**
 * The Events-list header's Tracker button (planning/EVENT_OVERSIGHT_ROLE_PLAN.md § Tracker
 * policy) — one of the two in-screen entry points that shipped ungated.
 *
 * Also pins the events query onto the canonical `eventsListKey` factory. The key's scope
 * segment is not decoration: React Query is cleared on an auth *identity* transition only, so a
 * key that didn't move when the director claim was granted would keep serving the viewer their
 * old membership-scoped list.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyEventMembership } from '@/lib/rbac/my-memberships';
import { EventsListScreen } from './EventsListScreen';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

/** `undefined` = the shared membership query hasn't resolved yet. */
const memberships = vi.hoisted(() => ({
  data: undefined as MyEventMembership[] | undefined,
}));
vi.mock('@/lib/rbac/useMyEventMemberships', () => ({
  useMyEventMemberships: () => memberships,
}));

// Only the reader is stubbed; `eventsListKey` stays real so the key assertions below are about
// what production actually caches under.
vi.mock('@/lib/events/events-read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/events/events-read')>()),
  listEvents: vi.fn(async () => []),
}));

vi.mock('./events-service', () => ({ createEvent: vi.fn(), createEventFromTemplate: vi.fn() }));
vi.mock('@/lib/departments/departments-service', () => ({
  listDepartments: vi.fn(async () => []),
}));
vi.mock('@/lib/templates/templates-service', () => ({ listTemplates: vi.fn(async () => []) }));
vi.mock('@/lib/schedules/schedule-templates-service', () => ({
  getDefaultMasterTemplate: vi.fn(async () => null),
  listScheduleTemplates: vi.fn(async () => []),
}));
vi.mock('./stages-service', () => ({ listStages: vi.fn(async () => []) }));
vi.mock('./schedule-days-service', () => ({ applyTemplateDaysToEvent: vi.fn() }));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventsListScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
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

describe('EventsListScreen Tracker button gate', () => {
  it('offers Tracker to an admin', () => {
    auth.isAdmin = true;
    renderScreen();

    expect(trackerLink()).toHaveAttribute('href', '/tracker');
  });

  it('offers Tracker to a production director', () => {
    auth.isProductionDirector = true;
    renderScreen();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('offers Tracker to a PM', () => {
    memberships.data = on('production-manager');
    renderScreen();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('hides Tracker from a department lead', () => {
    memberships.data = on('department-lead');
    renderScreen();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from a tech', () => {
    memberships.data = on('tech');
    renderScreen();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker while the membership summary is unresolved', () => {
    memberships.data = undefined;
    renderScreen();

    expect(trackerLink()).not.toBeInTheDocument();
  });
});

describe('EventsListScreen events query key', () => {
  it('caches a membership-scoped viewer under the canonical key', () => {
    const client = renderScreen();

    expect(
      client.getQueryCache().find({ queryKey: ['events', 'list', 'user-1', 'membership'] }),
    ).toBeDefined();
  });

  it('moves an oversight viewer to the all-events scope segment', () => {
    auth.isProductionDirector = true;
    const client = renderScreen();

    // Same uid, different scope — a mid-session claim grant can't be served the stale list.
    expect(
      client.getQueryCache().find({ queryKey: ['events', 'list', 'user-1', 'all'] }),
    ).toBeDefined();
    expect(
      client.getQueryCache().find({ queryKey: ['events', 'list', 'user-1', 'membership'] }),
    ).toBeUndefined();
  });
});
