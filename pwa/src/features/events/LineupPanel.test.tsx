import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Advance } from '@/lib/advances/advance';
import type { EventRecord } from '@/lib/events/event';
import type { StageRecord } from '@/lib/events/stage';
import type { LocatedAdvance } from '@/lib/tracker/tracker';
import { listEventAdvances } from '@/lib/tracker/tracker-service';
import { listStages } from './stages-service';
import { createAdvance, deleteAdvance, updateAdvanceLineup } from './advances-service';
import { LineupPanel } from './LineupPanel';

vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/lib/tracker/tracker-service', () => ({ listEventAdvances: vi.fn() }));
vi.mock('./stages-service', () => ({ listStages: vi.fn() }));
vi.mock('./advances-service', () => ({
  createAdvance: vi.fn().mockResolvedValue('new-id'),
  deleteAdvance: vi.fn().mockResolvedValue(undefined),
  updateAdvanceLineup: vi.fn().mockResolvedValue(undefined),
}));

const advance = (over: Partial<Advance> = {}): Advance => ({
  id: 'a1',
  artistName: 'Staind',
  performanceDate: null,
  slot: 1,
  notes: null,
  additions: null,
  concerns: null,
  pending: null,
  advanceCallAt: null,
  advanceCallLink: null,
  googleCalendarEventId: null,
  sections: {},
  content: {},
  createdBy: 'u1',
  createdAt: null,
  updatedAt: null,
  ...over,
});

const located = (stageId: string, over: Partial<Advance> = {}): LocatedAdvance => ({
  stageId,
  stageName: stageId === 'main' ? 'Main Stage' : 'Raised Rowdy',
  advance: advance(over),
});

// Only id/name/dates/departments are read by the panel.
const event = (over: Partial<EventRecord> = {}): EventRecord =>
  ({
    id: 'e1',
    name: 'Rock the Country',
    startDate: null,
    endDate: null,
    departmentIds: ['audio'],
    ...over,
  }) as unknown as EventRecord;

const stage = (id: string, name: string): StageRecord =>
  ({ id, name, order: 0 }) as unknown as StageRecord;

function renderPanel(ev = event(), canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <LineupPanel event={ev} canEdit={canEdit} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { client, ...result };
}

// A mutation's onSuccess invalidates ['eventAdvances', id], which refetches listEventAdvances
// (its second call) and then setState. Waiting only on the service mock returns before that
// trailing refetch settles → an unwrapped act() update. Wait instead on the refetch having both
// fired (second call) and gone idle, inside RTL's act-aware waitFor, so the update is flushed.
async function settleAfterMutation(client: QueryClient) {
  await waitFor(() => {
    expect(listEventAdvances).toHaveBeenCalledTimes(2);
    expect(client.isFetching()).toBe(0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listStages).mockResolvedValue([stage('main', 'Main Stage')]);
  vi.mocked(listEventAdvances).mockResolvedValue([]);
});

describe('LineupPanel', () => {
  it('groups by show day and shows booked artists in their slots', async () => {
    vi.mocked(listStages).mockResolvedValue([stage('main', 'Main Stage'), stage('rowdy', 'Raised Rowdy')]);
    vi.mocked(listEventAdvances).mockResolvedValue([
      located('main', { id: 'st', artistName: 'Staind', slot: 1, performanceDate: new Date(2026, 5, 28) }),
      located('rowdy', { id: 'at', artistName: 'Atlus', slot: 1, performanceDate: new Date(2026, 5, 28) }),
    ]);
    renderPanel(event({ startDate: new Date(2026, 5, 27), endDate: new Date(2026, 5, 28) }));

    expect(await screen.findByText('Staind')).toBeInTheDocument();
    expect(screen.getByText('Atlus')).toBeInTheDocument();
    // Two day groups × two stages.
    expect(screen.getAllByText('Main Stage')).toHaveLength(2);
    expect(screen.getAllByText('Raised Rowdy')).toHaveLength(2);
    expect(screen.getAllByText(/1 · Headliner/)).toHaveLength(4);
  });

  it('flags a slot held by two artists as a conflict', async () => {
    vi.mocked(listEventAdvances).mockResolvedValue([
      located('main', { id: 'a', artistName: 'Staind', slot: 1 }),
      located('main', { id: 'b', artistName: 'Brantley Gilbert', slot: 1 }),
    ]);
    renderPanel();
    expect(await screen.findByText(/Slot conflict — 2 artists/)).toBeInTheDocument();
  });

  it('defaults to five slots on the main stage and four on side stages', async () => {
    vi.mocked(listStages).mockResolvedValue([stage('main', 'Main Stage'), stage('rowdy', 'Raised Rowdy')]);
    renderPanel();
    await screen.findByText('Main Stage');
    const mainCard = within(screen.getByText('Main Stage').closest('section') as HTMLElement);
    const rowdyCard = within(screen.getByText('Raised Rowdy').closest('section') as HTMLElement);
    expect(mainCard.getByText(/5 · Artist 5/)).toBeInTheDocument();
    expect(rowdyCard.getByText(/4 · Artist 4/)).toBeInTheDocument();
    expect(rowdyCard.queryByText(/5 · Artist 5/)).not.toBeInTheDocument();
  });

  it('adds and trims the last slot while it is open', async () => {
    renderPanel();
    expect(await screen.findByText(/5 · Artist 5/)).toBeInTheDocument();
    expect(screen.queryByText(/6 · Artist 6/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Add slot' }));
    expect(screen.getByText(/6 · Artist 6/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '− Remove slot' }));
    expect(screen.queryByText(/6 · Artist 6/)).not.toBeInTheDocument();
  });

  it('refuses to remove the last slot while an artist holds it', async () => {
    vi.mocked(listEventAdvances).mockResolvedValue([
      located('main', { id: 'a', artistName: 'Staind', slot: 5 }),
    ]);
    renderPanel();
    await screen.findByText('Staind');
    expect(screen.getByRole('button', { name: '− Remove slot' })).toBeDisabled();
  });

  it('books an open slot by creating the advance', async () => {
    const { client } = renderPanel();
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Book artist' }))[0]);
    fireEvent.change(screen.getByPlaceholderText('Artist name'), { target: { value: 'Ashley Cooke' } });
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await settleAfterMutation(client);
    expect(createAdvance).toHaveBeenCalledTimes(1);
    expect(createAdvance).toHaveBeenCalledWith(
      'e1',
      'main',
      { artistName: 'Ashley Cooke', slot: 1, performanceDate: null },
      ['audio'],
      'u1',
    );
  });

  it('re-slots an existing same-name advance instead of duplicating it', async () => {
    vi.mocked(listEventAdvances).mockResolvedValue([
      located('main', { id: 'existing', artistName: 'Staind', slot: null }),
    ]);
    const { client } = renderPanel();
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Book artist' }))[0]);
    fireEvent.change(screen.getByPlaceholderText('Artist name'), { target: { value: 'staind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await settleAfterMutation(client);
    expect(updateAdvanceLineup).toHaveBeenCalledTimes(1);
    expect(updateAdvanceLineup).toHaveBeenCalledWith('e1', 'main', 'existing', {
      slot: 1,
      performanceDate: null,
    });
    expect(createAdvance).not.toHaveBeenCalled();
  });

  it('deletes a data-less shell on remove, after the inline confirm', async () => {
    vi.mocked(listEventAdvances).mockResolvedValue([located('main', { id: 'shell' })]);
    const { client } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(screen.getByText(/No advance data has been entered/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settleAfterMutation(client);
    expect(deleteAdvance).toHaveBeenCalledWith('e1', 'main', 'shell');
  });

  it('warns before displacing an advance with data and can keep it off-lineup', async () => {
    vi.mocked(listEventAdvances).mockResolvedValue([
      located('main', { id: 'full', notes: 'runner needed' }),
    ]);
    const { client } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(screen.getByText(/has advance data/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep the advance — clear it from the lineup' }));
    await settleAfterMutation(client);
    expect(updateAdvanceLineup).toHaveBeenCalledWith('e1', 'main', 'full', {
      slot: null,
      performanceDate: null,
    });
    expect(deleteAdvance).not.toHaveBeenCalled();
  });
});
