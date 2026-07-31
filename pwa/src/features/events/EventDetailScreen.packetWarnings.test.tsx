/**
 * A silently-degraded packet used to look identical to a correct one — a WebP saved as `.png`
 * dropped the event mark and the render still "succeeded". The server now returns non-fatal
 * `warnings`; these cover the only thing that makes them useful: that the screen actually shows
 * them, on both the generate and the save-to-Drive path, without blocking the packet itself.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRecord } from '@/lib/events/event';
import type { SavePacketResult } from '@/lib/google';
import { savePacketToDrive } from '@/lib/google';
import { generatePacket } from './events-service';
import { EventDetailScreen } from './EventDetailScreen';

const WEBP_WARNING =
  "A logo image isn't a PNG or JPEG (detected webp) so it couldn't be added to the packet. Re-upload it as PNG or JPEG: templates/abc123/logo/onLight-1782642992956.png";
const NO_LOGO_WARNING = 'The packet was generated without an event logo.';

const auth = vi.hoisted(() => ({ user: { uid: 'pm-1' }, isAdmin: true, isOrganizer: false }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

vi.mock('./events-service', () => ({
  generatePacket: vi.fn(),
  getEventBySlugOrId: vi.fn(),
  renameEventSlug: vi.fn(),
  setEventLogo: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock('@/lib/google', () => ({
  pickDriveFolder: vi.fn(async () => null),
  savePacketToDrive: vi.fn(),
  useGoogleConnection: () => ({ data: { hasDrive: true } }),
}));

vi.mock('@/lib/rbac/membership', () => ({ getEventRole: vi.fn(async () => 'production-manager') }));
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

// Presentational/panel children: each pulls in its own Firestore reads and none of them
// participate in the packet flow.
vi.mock('@/components/branding/LogoRow', () => ({ LogoRow: () => null }));
vi.mock('@/components/branding/LogoUploader', () => ({ LogoUploader: () => null }));
vi.mock('./EventForm', () => ({ EventForm: () => null }));
vi.mock('./StagesPanel', () => ({ StagesPanel: () => null }));
vi.mock('./LineupPanel', () => ({ LineupPanel: () => null }));
vi.mock('./EventContactsPanel', () => ({ EventContactsPanel: () => null }));
vi.mock('./BookedCallsPanel', () => ({ BookedCallsPanel: () => null }));

const EVENT: EventRecord = {
  id: 'event-1',
  name: 'Riverside Fest',
  slug: 'riverside-fest',
  status: 'active',
  venue: 'Riverfront',
  startDate: new Date('2026-08-15T05:00:00.000Z'),
  endDate: new Date('2026-08-17T05:00:00.000Z'),
  loadInDays: 0,
  loadOutDays: 0,
  timeZone: 'America/Chicago',
  departmentIds: [],
  driveFolderId: 'folder-1',
  driveFolderName: 'Riverside Fest',
  packetDrive: null,
  festivalId: null,
  location: null,
  shortCode: null,
  bookingLabel: null,
  googleCalendarId: null,
  eventLogo: null,
  templateId: null,
  createdBy: 'admin-1',
  createdAt: null,
  updatedAt: null,
};

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

/** The caution panel, once it has content. */
async function findWarningPanel(): Promise<HTMLElement> {
  const region = await screen.findByRole('status');
  await within(region).findByText(/generated, but something was left out/);
  return region;
}

/** Render, wait for the event to resolve, then press one of the packet buttons. */
async function clickPacketButton(name: string): Promise<void> {
  renderScreen();
  await screen.findByRole('heading', { name: 'Riverside Fest' });
  fireEvent.click(screen.getByRole('button', { name }));
}

function savedToDrive(): SavePacketResult {
  return { saved: true, webViewLink: 'https://drive.example/file' };
}

beforeEach(async () => {
  const { getEventBySlugOrId } = await import('./events-service');
  vi.mocked(getEventBySlugOrId).mockResolvedValue(EVENT);
  vi.mocked(generatePacket).mockResolvedValue({
    url: 'https://storage.example/packet.pdf',
    path: 'events/event-1/packets/1.pdf',
    warnings: [],
  });
  vi.mocked(savePacketToDrive).mockResolvedValue(savedToDrive());
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EventDetailScreen packet warnings', () => {
  it('shows nothing when the render came back clean', async () => {
    await clickPacketButton('Generate packet');

    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });

  it('lists every warning after Generate packet, and still opens the packet', async () => {
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/1.pdf',
      warnings: [WEBP_WARNING, NO_LOGO_WARNING],
    });

    await clickPacketButton('Generate packet');

    const panel = await findWarningPanel();
    // One <li> per warning — never a concatenated blob.
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
    expect(within(panel).getByText(NO_LOGO_WARNING)).toBeInTheDocument();
    // The degraded packet is still valid, so it opens regardless.
    expect(window.open).toHaveBeenCalledWith(
      'https://storage.example/packet.pdf',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('splits the Storage path onto its own line so the filename stays readable', async () => {
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/1.pdf',
      warnings: [WEBP_WARNING],
    });

    await clickPacketButton('Generate packet');

    const panel = await findWarningPanel();
    // Prose keeps the instruction; the path is broken out, not glued to the sentence.
    expect(within(panel).getByText(/Re-upload it as PNG or JPEG$/)).toBeInTheDocument();
    const path = within(panel).getByText('templates/abc123/logo/onLight-1782642992956.png');
    expect(path).toHaveClass('font-mono');
    expect(path).toHaveAttribute('title', 'templates/abc123/logo/onLight-1782642992956.png');
  });

  it('elides the middle of a long path but keeps the whole filename', async () => {
    const longPath = 'events/8Kq2mNpLxR4tYw7ZbC1v/logo/onLight-1782642992956.png';
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/1.pdf',
      warnings: [`A logo image could not be read from storage: ${longPath}`],
    });

    await clickPacketButton('Generate packet');

    const panel = await findWarningPanel();
    // Which file to re-upload is the whole point, so the filename is never the part that's cut.
    const shown = within(panel).getByTitle(longPath);
    expect(shown).toHaveTextContent('…/onLight-1782642992956.png');
    expect(shown.textContent).not.toBe(longPath);
    expect(shown.textContent!.startsWith('events/')).toBe(true);
  });

  it('surfaces warnings from the Save packet to Drive flow too', async () => {
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/1.pdf',
      warnings: [WEBP_WARNING],
    });

    await clickPacketButton('Save packet to Drive');

    const panel = await findWarningPanel();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1);
    expect(savePacketToDrive).toHaveBeenCalled();
  });

  it('dismisses the panel and clears it on the next run', async () => {
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/1.pdf',
      warnings: [WEBP_WARNING],
    });

    await clickPacketButton('Generate packet');
    const panel = await findWarningPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();

    // A clean re-run must not resurrect the previous warning.
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/2.pdf',
      warnings: [],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate packet' }));
    await waitFor(() => expect(generatePacket).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });

  it('announces the warnings in a live region with no axe violations', async () => {
    vi.mocked(generatePacket).mockResolvedValue({
      url: 'https://storage.example/packet.pdf',
      path: 'events/event-1/packets/1.pdf',
      warnings: [WEBP_WARNING, NO_LOGO_WARNING],
    });

    const { container } = renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Generate packet' }));

    const panel = await findWarningPanel();
    expect(panel).toHaveAttribute('aria-live', 'polite');
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
