import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepartmentRecord } from '@/lib/departments/department';
import type { EventMemberRow } from '@/lib/rbac/membership';
import type { EventRole } from '@/lib/rbac/roles';
import type { Viewer } from '@/lib/rbac/permissions';
import { listEventMembers } from '@/lib/rbac/membership';
import { EventTeamPanel } from './EventTeamPanel';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'pm1', displayName: 'Pat Manager', email: 'pat@example.com' } }),
}));
// Mocked whole (not spread from the original) so the test never pulls in the Firestore client.
vi.mock('@/lib/rbac/membership', () => ({
  eventMembersKey: (eventId: string) => ['events', 'members', eventId],
  listEventMembers: vi.fn(),
}));
vi.mock('./event-members-service', () => ({
  assignMemberByEmail: vi.fn(),
  assignMemberByUid: vi.fn(),
  removeMember: vi.fn(),
}));

const departments: DepartmentRecord[] = [
  { id: 'audio', name: 'Audio', order: 0 },
  { id: 'lighting', name: 'Lighting', order: 1 },
];

const member = (uid: string, role: EventRole, over: Partial<EventMemberRow> = {}): EventMemberRow =>
  ({
    uid,
    role,
    addedBy: 'pm1',
    addedAt: null,
    departments: [],
    email: `${uid}@example.com`,
    displayName: null,
    ...over,
  }) satisfies EventMemberRow;

const roster: EventMemberRow[] = [
  member('pm1', 'production-manager', { displayName: 'Pat Manager' }),
  member('lead1', 'department-lead', { displayName: 'Lee Lead', departments: ['audio'] }),
];

function renderPanel(viewer: Viewer, viewerRole: EventRole | null) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EventTeamPanel
        eventId="e1"
        viewer={viewer}
        viewerRole={viewerRole}
        departments={departments}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listEventMembers).mockResolvedValue(roster);
});

describe('EventTeamPanel', () => {
  it('gives the production manager the full management surface', async () => {
    renderPanel({ uid: 'pm1', isAdmin: false }, 'production-manager');

    expect(await screen.findByText('Lee Lead')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1); // not on own row
    // Add-form role select + one per roster row.
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Audio' })).toBeInTheDocument();
  });

  it('shows a production director the roster read-only', async () => {
    renderPanel({ uid: 'dir1', isAdmin: false, isProductionDirector: true }, null);

    expect(await screen.findByText('Lee Lead')).toBeInTheDocument();
    expect(screen.getByText('Pat Manager')).toBeInTheDocument();
    // Roles render as text, not controls.
    expect(screen.getByText('Production Manager')).toBeInTheDocument();
    expect(screen.getByText('Department Lead')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();

    expect(screen.queryByPlaceholderText('name@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each<[string, EventRole]>([
    ['department lead', 'department-lead'],
    ['tech', 'tech'],
  ])('renders nothing for a %s and never reads the roster', async (_label, role) => {
    const { container } = renderPanel({ uid: 'u9', isAdmin: false }, role);

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(listEventMembers).not.toHaveBeenCalled());
  });
});
