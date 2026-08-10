/**
 * The `/tracker` route guard (planning/EVENT_OVERSIGHT_ROLE_PLAN.md § Tracker policy).
 *
 * Hiding the navigation isn't the boundary — the route is. Admins, production directors, and
 * PMs get the overview; leads and techs are redirected to Events. The unresolved-membership
 * case matters most: a guard that bounced on "not known yet" would eject a legitimate PM
 * whenever the shared membership query was slow.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '@/lib/events/event';
import type { MyEventMembership } from '@/lib/rbac/my-memberships';
import { listEventTrackerSummaries } from '@/lib/tracker/tracker-service';
import type { EventTrackerPage, EventTrackerSummary } from '@/lib/tracker/tracker-service';
import { TrackerOverviewScreen } from './TrackerOverviewScreen';

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

vi.mock('@/lib/tracker/tracker-service', () => ({ listEventTrackerSummaries: vi.fn() }));

function event(id: string, name: string): EventRecord {
  return {
    id,
    name,
    slug: id,
    status: 'active',
    venue: null,
    venueAddress: null,
    startDate: new Date('2026-08-15T05:00:00.000Z'),
    endDate: new Date('2026-08-17T05:00:00.000Z'),
    loadInDays: 0,
    loadOutDays: 0,
    timeZone: 'America/Chicago',
    departmentIds: [],
    driveFolderId: null,
    driveFolderName: null,
    packetDrive: null,
    festivalId: null,
    location: null,
    shortCode: null,
    bookingLabel: null,
    eventLogo: null,
    templateId: null,
    createdBy: 'admin-1',
    createdAt: null,
    updatedAt: null,
  };
}

function summary(id: string, name: string): EventTrackerSummary {
  return {
    event: event(id, name),
    counts: { not_started: 1, in_progress: 0, complete: 1, total: 2 },
    pct: 0.5,
    advanceCount: 1,
  };
}

function page(
  summaries: EventTrackerSummary[],
  cursor: EventTrackerPage['cursor'] = null,
  capped = false,
): EventTrackerPage {
  return { summaries, cursor, capped };
}

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tracker']}>
        <Routes>
          <Route path="/tracker" element={<TrackerOverviewScreen />} />
          <Route path="/events" element={<p>Events screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const redirected = () => screen.queryByText('Events screen');

const on = (role: MyEventMembership['role']): MyEventMembership[] => [{ eventId: 'event-1', role }];

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'user-1' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  memberships.data = [];
  vi.mocked(listEventTrackerSummaries).mockResolvedValue(page([summary('event-1', 'Riverside')]));
});

describe('TrackerOverviewScreen route guard', () => {
  it('serves the overview to an admin who is on no events', async () => {
    auth.isAdmin = true;
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Riverside' })).toBeInTheDocument();
    expect(redirected()).not.toBeInTheDocument();
  });

  it('serves the overview to a production director who is on no events', async () => {
    auth.isProductionDirector = true;
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Riverside' })).toBeInTheDocument();
  });

  it('serves the overview to a PM', async () => {
    memberships.data = on('production-manager');
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Riverside' })).toBeInTheDocument();
  });

  it('redirects a department lead to Events', () => {
    memberships.data = on('department-lead');
    renderRoute();

    expect(redirected()).toBeInTheDocument();
    expect(listEventTrackerSummaries).not.toHaveBeenCalled();
  });

  it('redirects a tech to Events', () => {
    memberships.data = on('tech');
    renderRoute();

    expect(redirected()).toBeInTheDocument();
  });

  it('redirects a member with no PM role on any of their events', () => {
    memberships.data = [
      { eventId: 'event-1', role: 'department-lead' },
      { eventId: 'event-2', role: 'tech' },
    ];
    renderRoute();

    expect(redirected()).toBeInTheDocument();
  });

  it('waits — never redirects — while the membership summary is unresolved', () => {
    memberships.data = undefined;
    renderRoute();

    expect(redirected()).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // Nothing is fetched until the viewer is known to be allowed.
    expect(listEventTrackerSummaries).not.toHaveBeenCalled();
  });

  it('passes the resolved membership summary through instead of re-reading it', async () => {
    memberships.data = on('production-manager');
    renderRoute();

    await screen.findByRole('heading', { name: 'Riverside' });
    expect(listEventTrackerSummaries).toHaveBeenCalledWith(
      { uid: 'user-1', isAdmin: false, isOrganizer: false, isProductionDirector: false },
      { cursor: null, memberships: memberships.data },
    );
  });

  it('appends the next page on "Load more" and stops offering it at the end', async () => {
    const cursor = { name: 'Riverside', id: 'event-1', loaded: 1 };
    auth.isAdmin = true;
    vi.mocked(listEventTrackerSummaries)
      .mockResolvedValueOnce(page([summary('event-1', 'Riverside')], cursor))
      .mockResolvedValueOnce(page([summary('event-2', 'Southbank')]));
    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Southbank' })).toBeInTheDocument();
    // The first page is kept, not replaced.
    expect(screen.getByRole('heading', { name: 'Riverside' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(vi.mocked(listEventTrackerSummaries).mock.calls[1][1]).toEqual({
      cursor,
      memberships: [],
    });
  });

  it('says so when the absolute read ceiling truncated the list', async () => {
    auth.isAdmin = true;
    vi.mocked(listEventTrackerSummaries).mockResolvedValue(
      page([summary('event-1', 'Riverside')], null, true),
    );
    renderRoute();

    expect(
      await screen.findByText(/there are more than this page can roll up/),
    ).toBeInTheDocument();
  });
});
