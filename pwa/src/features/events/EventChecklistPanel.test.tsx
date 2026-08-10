import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatChecklistTimestamp, type ChecklistItem } from '@/lib/checklists/checklist';
import { listChecklistTemplates } from '@/lib/checklists/checklist-templates-service';
import { listChecklistItems } from './event-checklist-service';
import { EventChecklistPanel } from './EventChecklistPanel';

// Mocked whole (not spread from the original) so the tests never pull in the Firestore client.
vi.mock('./event-checklist-service', () => ({
  eventChecklistKey: (eventId: string) => ['events', 'checklist', eventId],
  listChecklistItems: vi.fn(),
  addChecklistItem: vi.fn(),
  applyChecklistArrangement: vi.fn(),
  deleteChecklistItem: vi.fn(),
  importChecklistTemplate: vi.fn(),
  setChecklistItemCompletedAt: vi.fn(),
  setChecklistItemText: vi.fn(),
}));
vi.mock('@/lib/checklists/checklist-templates-service', () => ({
  checklistTemplatesKey: () => ['checklistTemplates'],
  listChecklistTemplates: vi.fn(),
}));

const TZ = 'America/Chicago';
const completedAt = new Date('2026-08-03T19:41:00Z');

const items: ChecklistItem[] = [
  { id: 'i1', text: 'Confirm shore power', section: 'main', order: 0, completedAt },
  { id: 'i2', text: 'Return radios', section: 'post-show', order: 0, completedAt: null },
];

function renderPanel(props: { canEdit: boolean; canView?: boolean }) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EventChecklistPanel eventId="e1" timeZone={TZ} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listChecklistItems).mockResolvedValue(items);
  vi.mocked(listChecklistTemplates).mockResolvedValue([]);
});

describe('EventChecklistPanel', () => {
  it('gives a PM/admin every control', async () => {
    renderPanel({ canEdit: true });

    expect(await screen.findByText('Confirm shore power')).toBeInTheDocument();
    expect(screen.getByLabelText('Checklist template to import')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add an item…')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a post-show item…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag to reorder: Return radios' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete: Return radios' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark complete: Return radios' })).toBeEnabled();
  });

  it('shows a production director the items and stamps with no controls', async () => {
    renderPanel({ canEdit: false, canView: true });

    expect(await screen.findByText('Confirm shore power')).toBeInTheDocument();
    expect(screen.getByText('Return radios')).toBeInTheDocument();
    expect(screen.getByText('1/2 done')).toBeInTheDocument();
    expect(screen.getByText(formatChecklistTimestamp(completedAt, TZ))).toBeInTheDocument();

    expect(screen.queryByLabelText('Checklist template to import')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add an item…')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add a post-show item…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Drag to reorder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete:/ })).not.toBeInTheDocument();
    // Completion state is shown, but not togglable — and the rename button is plain text now.
    expect(screen.getByRole('checkbox', { name: 'Confirm shore power: complete' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Return radios: not complete' })).toBeDisabled();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // The import control is the only consumer of templates — a read-only viewer skips the read.
    await waitFor(() => expect(listChecklistTemplates).not.toHaveBeenCalled());
  });

  it('renders nothing and reads nothing when the viewer cannot view (leads/techs)', async () => {
    const { container } = renderPanel({ canEdit: false });

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(listChecklistItems).not.toHaveBeenCalled();
      expect(listChecklistTemplates).not.toHaveBeenCalled();
    });
  });
});
