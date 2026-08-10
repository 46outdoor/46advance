/**
 * The `/tracker/:eventId` route guard (planning/EVENT_OVERSIGHT_ROLE_PLAN.md § Tracker policy).
 *
 * Being a PM somewhere isn't enough to open any event's tracker — a PM may open only the events
 * they production-manage, while oversight (admin / production director) may open any of them.
 * As with the overview, an unresolved role renders as loading and never as a redirect.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '@/lib/events/event';
import type { EventMember, EventRole } from '@/lib/rbac/roles';
import { getEventMember } from '@/lib/rbac/membership';
import { getEventTracker } from '@/lib/tracker/tracker-service';
import type { EventTrackerView } from '@/lib/tracker/tracker-service';
import { EventTrackerScreen } from './EventTrackerScreen';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

vi.mock('@/lib/rbac/membership', () => ({ getEventMember: vi.fn() }));
vi.mock('@/lib/tracker/tracker-service', () => ({ getEventTracker: vi.fn() }));

const EVENT: EventRecord = {
  id: 'event-1',
  name: 'Riverside Fest',
  slug: 'riverside-fest',
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

const VIEW: EventTrackerView = {
  event: EVENT,
  tracker: {
    columns: [],
    rows: [],
    summary: { not_started: 0, in_progress: 0, complete: 0, total: 0 },
  },
};

function member(role: EventRole): EventMember {
  return {
    role,
    addedBy: 'admin-1',
    addedAt: null,
    departments: [],
    email: null,
    displayName: null,
  };
}

/** A membership read that never settles — the "role still loading" state. */
function pendingRole(): Promise<EventMember | null> {
  return new Promise<EventMember | null>(() => {});
}

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tracker/event-1']}>
        <Routes>
          <Route path="/tracker/:eventId" element={<EventTrackerScreen />} />
          <Route path="/events" element={<p>Events screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const redirected = () => screen.queryByText('Events screen');

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'user-1' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  vi.mocked(getEventMember).mockResolvedValue(null);
  vi.mocked(getEventTracker).mockResolvedValue(VIEW);
});

describe('EventTrackerScreen route guard', () => {
  it("opens any event's tracker for an admin, without reading a membership", async () => {
    auth.isAdmin = true;
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Riverside Fest' })).toBeInTheDocument();
    // Oversight is decided from the claim alone — no per-event role read is issued.
    expect(getEventMember).not.toHaveBeenCalled();
  });

  it("opens any event's tracker for a production director, without reading a membership", async () => {
    auth.isProductionDirector = true;
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Riverside Fest' })).toBeInTheDocument();
    expect(getEventMember).not.toHaveBeenCalled();
  });

  it('opens the tracker for the PM of this event', async () => {
    vi.mocked(getEventMember).mockResolvedValue(member('production-manager'));
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Riverside Fest' })).toBeInTheDocument();
    expect(getEventMember).toHaveBeenCalledWith('user-1', 'event-1');
  });

  it('redirects the department lead of this event to Events', async () => {
    vi.mocked(getEventMember).mockResolvedValue(member('department-lead'));
    renderRoute();

    expect(await screen.findByText('Events screen')).toBeInTheDocument();
    expect(getEventTracker).not.toHaveBeenCalled();
  });

  it('redirects a tech to Events', async () => {
    vi.mocked(getEventMember).mockResolvedValue(member('tech'));
    renderRoute();

    expect(await screen.findByText('Events screen')).toBeInTheDocument();
  });

  it('redirects a PM elsewhere who has no membership on THIS event', async () => {
    // Being a production manager on another show grants nothing here.
    vi.mocked(getEventMember).mockResolvedValue(null);
    renderRoute();

    expect(await screen.findByText('Events screen')).toBeInTheDocument();
    expect(getEventTracker).not.toHaveBeenCalled();
  });

  it('waits — never redirects — while the role is still resolving', () => {
    vi.mocked(getEventMember).mockReturnValue(pendingRole());
    renderRoute();

    expect(redirected()).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(getEventTracker).not.toHaveBeenCalled();
  });
});
