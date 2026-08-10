/**
 * The event header's Tracker link (planning/EVENT_OVERSIGHT_ROLE_PLAN.md § Tracker policy) —
 * the second entry point that shipped ungated, and the one that is per-event rather than
 * global: a PM sees it on the shows they run, not on every show they're a member of.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '@/lib/events/event';
import type { EventMember, EventRole } from '@/lib/rbac/roles';
import { getEventMember } from '@/lib/rbac/membership';
import { getEventBySlugOrId } from './events-service';
import { EventDetailScreen } from './EventDetailScreen';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

vi.mock('./events-service', () => ({
  generatePacket: vi.fn(),
  getEventBySlugOrId: vi.fn(),
  renameEventSlug: vi.fn(),
  setEventLogo: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock('@/lib/rbac/membership', () => ({
  getEventMember: vi.fn(),
  listEventMembers: vi.fn(async () => []),
  eventMembersKey: (eventId: string) => ['events', 'members', eventId] as const,
}));

vi.mock('@/lib/google', () => ({
  pickDriveFolder: vi.fn(async () => null),
  savePacketToDrive: vi.fn(),
  useGoogleConnection: () => ({ data: { hasDrive: false } }),
}));
vi.mock('@/lib/branding/branding-service', () => ({
  brandingKey: () => ['branding'],
  getBranding: vi.fn(async () => ({ defaultLogos: [] })),
}));
vi.mock('@/lib/festivals/festivals-service', () => ({
  festivalsKey: () => ['festivals'],
  listFestivals: vi.fn(async () => []),
}));
vi.mock('@/lib/departments/departments-service', () => ({
  listDepartments: vi.fn(async () => []),
}));
vi.mock('@/lib/storage/uploads', () => ({ deleteStoredAssets: vi.fn() }));

// Panels and media: each pulls in its own reads and none of them own the header's links.
vi.mock('@/components/branding/LogoRow', () => ({ LogoRow: () => null }));
vi.mock('@/components/branding/LogoUploader', () => ({ LogoUploader: () => null }));
vi.mock('./EventForm', () => ({ EventForm: () => null }));
vi.mock('./StagesPanel', () => ({ StagesPanel: () => null }));
vi.mock('./LineupPanel', () => ({ LineupPanel: () => null }));
vi.mock('./EventContactsPanel', () => ({ EventContactsPanel: () => null }));
vi.mock('./EventChecklistPanel', () => ({ EventChecklistPanel: () => null }));
vi.mock('./EventTeamPanel', () => ({ EventTeamPanel: () => null }));
vi.mock('./BookedCallsPanel', () => ({ BookedCallsPanel: () => null }));

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

function member(role: EventRole): EventMember {
  return { role, addedBy: 'admin-1', addedAt: null, departments: [], email: null, displayName: null };
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/events/riverside-fest']}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetailScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Render and wait for the header, so an absent Tracker link means "gated out" rather than
 * "not painted yet". The PM/oversight cases below use this same helper and DO find the link,
 * which is what proves the wait outlasts the role read for the negative cases too.
 */
async function renderHeader(): Promise<void> {
  renderScreen();
  await screen.findByRole('heading', { name: 'Riverside Fest' });
  await screen.findByRole('link', { name: 'Documents' });
}

const trackerLink = () => screen.queryByRole('link', { name: 'Tracker' });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'user-1' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  vi.mocked(getEventBySlugOrId).mockResolvedValue(EVENT);
  vi.mocked(getEventMember).mockResolvedValue(null);
});

describe('EventDetailScreen Tracker link gate', () => {
  it('offers Tracker to an admin who is not a member of the event', async () => {
    auth.isAdmin = true;
    await renderHeader();

    expect(trackerLink()).toHaveAttribute('href', '/tracker/event-1');
  });

  it('offers Tracker to a production director who is not a member of the event', async () => {
    auth.isProductionDirector = true;
    await renderHeader();

    expect(trackerLink()).toBeInTheDocument();
  });

  it("offers Tracker to this event's PM", async () => {
    vi.mocked(getEventMember).mockResolvedValue(member('production-manager'));
    await renderHeader();

    expect(trackerLink()).toBeInTheDocument();
  });

  it('hides Tracker from a department lead', async () => {
    vi.mocked(getEventMember).mockResolvedValue(member('department-lead'));
    await renderHeader();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from a tech', async () => {
    vi.mocked(getEventMember).mockResolvedValue(member('tech'));
    await renderHeader();

    expect(trackerLink()).not.toBeInTheDocument();
  });

  it('hides Tracker from a viewer with no role on this event', async () => {
    await renderHeader();

    expect(trackerLink()).not.toBeInTheDocument();
  });
});
