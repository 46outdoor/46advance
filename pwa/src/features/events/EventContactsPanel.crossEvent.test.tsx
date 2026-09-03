/**
 * The Crew panel's "Manage directory →" link (planning/archive/feature/PWA_MOBILE_NAV_PLAN.md § "In-app links
 * must honour the same policy"). It shipped ABOVE the `canEdit` block, so every event member —
 * techs included — got a one-click route to the global directory that the nav registry hides
 * from anyone who is not admin / organizer / production director / production coordinator.
 * Hiding the nav destination accomplishes nothing while a screen still links to it.
 *
 * These tests pin the panel to the registry's `cross-event` rule (`resolveNavVisibility`), which
 * stays real here — the point is that there is ONE answer per capability, so a change to the
 * rule must move this panel too. It is presentation, not access control: `contacts/{id}` is
 * still `allow read: if isActiveUser()`, and any approved user can reach /contacts by typing
 * the URL (tightening the rules is planned in planning/ACCESS_SCOPING_PLAN.md).
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '@/lib/contacts/contact';
import { listEventContacts, type ResolvedEventContact } from './event-contacts-service';
import { EventContactsPanel } from './EventContactsPanel';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  isAdmin: false,
  isOrganizer: false,
  isProductionDirector: false,
  isProductionCoordinator: false,
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

// Mocked whole (not spread from the original) so the tests never pull in the Firestore client.
vi.mock('./event-contacts-service', () => ({
  attachContact: vi.fn(),
  detachContact: vi.fn(),
  listEventContacts: vi.fn(),
  setEventContactNotes: vi.fn(),
}));
vi.mock('@/lib/contacts/contacts-service', () => ({ listContacts: vi.fn(async () => []) }));
vi.mock('./event-members-service', () => ({ enrollTechIfAbsent: vi.fn() }));
vi.mock('@/lib/rbac/membership', () => ({
  eventMembersKey: (eventId: string) => ['events', 'members', eventId] as const,
}));

const CONTACT: Contact = {
  id: 'contact-1',
  name: 'Dana Reyes',
  role: 'Audio',
  company: null,
  phone: null,
  email: null,
  notes: null,
  photo: null,
  userId: null,
  createdBy: 'admin-1',
  createdAt: null,
  updatedAt: null,
};

const CREW: ResolvedEventContact[] = [
  {
    attachment: { id: 'attach-1', contactId: 'contact-1', roleLabel: 'Stage Manager', notes: null },
    contact: CONTACT,
  },
];

/**
 * Render and wait for the crew read to paint, so an absent link means "gated out" rather than
 * "not painted yet" — and so every case proves the panel itself still rendered.
 */
async function renderPanel(canEdit = false): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventContactsPanel eventId="event-1" uid="user-1" canEdit={canEdit} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('Dana Reyes');
}

const directoryLink = () => screen.queryByRole('link', { name: /Manage directory/ });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'user-1' };
  auth.isAdmin = false;
  auth.isOrganizer = false;
  auth.isProductionDirector = false;
  auth.isProductionCoordinator = false;
  vi.mocked(listEventContacts).mockResolvedValue(CREW);
});

describe('EventContactsPanel "Manage directory" cross-event gate', () => {
  it('offers the directory to an admin', async () => {
    auth.isAdmin = true;
    await renderPanel();

    expect(directoryLink()).toHaveAttribute('href', '/contacts');
  });

  it('offers the directory to an organizer', async () => {
    auth.isOrganizer = true;
    await renderPanel();

    expect(directoryLink()).toBeInTheDocument();
  });

  it('offers the directory to a production director', async () => {
    auth.isProductionDirector = true;
    await renderPanel();

    expect(directoryLink()).toBeInTheDocument();
  });

  /**
   * REGRESSION. The panel hand-built its `Viewer` from three claims and never picked up
   * `isProductionCoordinator` when Phase 2 added it to the registry's `cross-event` rule, so a
   * coordinator silently lost this link — every capability flag on `Viewer` is optional, so the
   * omission compiled cleanly. Fixed by sourcing the viewer from `useViewer()`. This case fails
   * against the old literal.
   */
  it('offers the directory to a production coordinator', async () => {
    auth.isProductionCoordinator = true;
    await renderPanel();

    expect(directoryLink()).toBeInTheDocument();
  });

  it('hides the directory from a plain event member (tech), leaving the panel intact', async () => {
    await renderPanel();

    expect(directoryLink()).not.toBeInTheDocument();
    // The panel is gated, not blanked — without these the assertion above would pass on an
    // empty render.
    expect(screen.getByRole('heading', { name: 'Crew' })).toBeInTheDocument();
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument();
    expect(screen.getByText('Stage Manager')).toBeInTheDocument();
  });

  it('hides the directory from a production manager holding no global claim', async () => {
    // `canEdit` is the per-event PM/admin scope; it says nothing about cross-event capability.
    await renderPanel(true);

    expect(directoryLink()).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crew' })).toBeInTheDocument();
    expect(screen.getByText('Add crew member')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
    // The second /contacts link, inside the `canEdit` block, is deliberately untouched (plan
    // § In-app links) — one flag must not sweep both away.
    expect(await screen.findByRole('link', { name: 'Add more' })).toHaveAttribute(
      'href',
      '/contacts',
    );
  });
});
