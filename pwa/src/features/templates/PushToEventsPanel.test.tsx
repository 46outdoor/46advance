import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DepartmentRecord } from '@/lib/departments/department';
import type { EventRecord } from '@/lib/events/event';
import type {
  PushTemplateProductionInput,
  PushTemplateProductionOutput,
  TemplatePushChange,
  TemplatePushEventDiff,
} from '@contracts/callables/templates';
import { PushToEventsPanel } from './PushToEventsPanel';

const pushTemplateProduction =
  vi.fn<(input: PushTemplateProductionInput) => Promise<PushTemplateProductionOutput>>();
const listEvents = vi.fn<() => Promise<EventRecord[]>>();
const listDepartments = vi.fn<() => Promise<DepartmentRecord[]>>();

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'admin1' }, isAdmin: true, isOrganizer: false }),
}));
vi.mock('@/lib/events/events-read', () => ({
  listEvents: () => listEvents(),
  // Key builder is pure — the real shape keeps the query cache keyed like production.
  eventsListKey: (viewer: { uid?: string } | null | undefined) => [
    'events',
    'list',
    viewer?.uid ?? null,
    'test-scope',
  ],
}));
vi.mock('@/lib/departments/departments-service', () => ({
  listDepartments: () => listDepartments(),
}));
// The callable wrapper is the only server touchpoint — stub it, keeping the real limit constant.
vi.mock('@/lib/templates/template-push-service', () => ({
  PUSH_TARGET_LIMIT: 25,
  pushTemplateProduction: (input: PushTemplateProductionInput) => pushTemplateProduction(input),
}));

const TEMPLATE_ID = 'tpl1';

// Only id/name/templateId are read by the panel.
const event = (id: string, name: string, templateId: string | null): EventRecord =>
  ({ id, name, templateId }) as unknown as EventRecord;

const change = (over: Partial<TemplatePushChange> = {}): TemplatePushChange => ({
  scope: 'eventProduction',
  stageName: null,
  departmentId: null,
  key: 'site_access',
  from: '',
  to: 'Gate C, 07:00',
  ...over,
});

const diff = (over: Partial<TemplatePushEventDiff> = {}): TemplatePushEventDiff => ({
  eventId: 'e1',
  eventName: 'Rock the Country',
  changes: [change()],
  skippedStages: [],
  ...over,
});

const output = (
  dryRun: boolean,
  events: TemplatePushEventDiff[] = [diff()],
): PushTemplateProductionOutput => ({ dryRun, events });

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PushToEventsPanel templateId={TEMPLATE_ID} />
    </QueryClientProvider>,
  );
}

/** Collapse JSX-inserted whitespace so assertions read as the rendered sentence. */
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const eventCheckbox = (name: string) => screen.getByRole('checkbox', { name });

async function selectAndPreview(name = 'Rock the Country') {
  fireEvent.click(await screen.findByRole('checkbox', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
  await waitFor(() => expect(pushTemplateProduction).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  listEvents.mockResolvedValue([
    event('e1', 'Rock the Country', TEMPLATE_ID),
    event('e2', 'Boots in the Park', null),
  ]);
  listDepartments.mockResolvedValue([{ id: 'audio', name: 'Audio', order: 0 }]);
  pushTemplateProduction.mockImplementation(async (input) => output(input.dryRun));
});

describe('PushToEventsPanel selection', () => {
  it('pre-checks both sections but no target events', async () => {
    renderPanel();
    await screen.findByRole('checkbox', { name: 'Rock the Country' });

    expect(eventCheckbox('Production record')).toBeChecked();
    expect(eventCheckbox('Per-stage house packages')).toBeChecked();
    expect(eventCheckbox('Rock the Country')).not.toBeChecked();
    expect(eventCheckbox('Boots in the Park')).not.toBeChecked();
  });

  it('labels events seeded from this template and surfaces the 25-event cap', async () => {
    renderPanel();
    await screen.findByRole('checkbox', { name: 'Rock the Country' });

    expect(screen.getByText('From this template')).toBeInTheDocument();
    expect(screen.getByText('Other events')).toBeInTheDocument();
    expect(screen.getByText(/0 of 25 selected/)).toBeInTheDocument();
    // Pushing is irreversible: there is deliberately no select-all control.
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
  });
});

describe('PushToEventsPanel preview gate', () => {
  it('keeps Apply disabled until a preview succeeds', async () => {
    renderPanel();
    await screen.findByRole('checkbox', { name: 'Rock the Country' });

    expect(screen.getByRole('button', { name: /^Apply to/ })).toBeDisabled();

    await selectAndPreview();

    expect(pushTemplateProduction).toHaveBeenCalledWith({
      templateId: TEMPLATE_ID,
      eventIds: ['e1'],
      include: { production: true, stageProduction: true },
      dryRun: true,
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply to 1 event' })).toBeEnabled(),
    );
  });

  it('re-locks Apply when the selection changes after a preview', async () => {
    renderPanel();
    await selectAndPreview();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply to 1 event' })).toBeEnabled(),
    );

    fireEvent.click(eventCheckbox('Boots in the Park'));

    expect(screen.getByRole('button', { name: /^Apply to/ })).toBeDisabled();
  });
});

describe('PushToEventsPanel diff rendering', () => {
  it('resolves raw field keys to registry labels for both scopes', async () => {
    pushTemplateProduction.mockResolvedValue(
      output(true, [
        diff({
          changes: [
            change({ key: 'site_access', from: '', to: 'Gate C, 07:00' }),
            change({
              scope: 'stageProduction',
              stageName: 'Main Stage',
              departmentId: 'audio',
              key: 'main_pa',
              from: 'd&b V',
              to: 'd&b KSL',
            }),
            change({ key: 'not_in_registry', from: 'a', to: 'b' }),
          ],
        }),
      ]),
    );
    renderPanel();
    await selectAndPreview();

    const lines = await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items.length).toBe(3);
      return items.map(text);
    });

    expect(lines).toContain('Site access / arrival: (unset) → Gate C, 07:00');
    expect(lines).toContain('Main PA / speakers: d&b V → d&b KSL');
    // No FieldDef matches — fall back to the raw key rather than hiding the change.
    expect(lines).toContain('not_in_registry: a → b');
    expect(screen.queryByText(/site_access/)).not.toBeInTheDocument();
    expect(screen.queryByText(/main_pa/)).not.toBeInTheDocument();
    // Stage groups read with the department's display name, not its id.
    expect(screen.getByText('Main Stage — Audio')).toBeInTheDocument();
  });

  it('renders contacts/links as replaced entry counts, not fields', async () => {
    pushTemplateProduction.mockResolvedValue(
      output(true, [
        diff({
          changes: [
            change({ key: 'contacts', from: '3', to: '4' }),
            change({ key: 'links', from: '0', to: '2' }),
          ],
        }),
      ]),
    );
    renderPanel();
    await selectAndPreview();

    const lines = await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items.length).toBe(2);
      return items.map(text);
    });

    expect(lines).toContain('Contacts: 3 → 4 (replaced)');
    expect(lines).toContain('Links: 0 → 2 (replaced)');
  });

  it('states plainly when an event has no changes', async () => {
    pushTemplateProduction.mockResolvedValue(output(true, [diff({ changes: [] })]));
    renderPanel();
    await selectAndPreview();

    expect(
      await screen.findByText('No changes — this event already matches the template.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('surfaces skipped stages as a note explaining they will not be created', async () => {
    pushTemplateProduction.mockResolvedValue(
      output(true, [diff({ skippedStages: ['Barn Stage', 'Acoustic Porch'] })]),
    );
    renderPanel();
    await selectAndPreview();

    const note = await screen.findByText(/Skipped stages/);
    expect(text(note)).toContain('Barn Stage, Acoustic Porch');
    expect(text(note)).toContain('never creates one');
  });
});

describe('PushToEventsPanel confirmation gate', () => {
  it('does not write until the confirmation is given, then pushes with dryRun false', async () => {
    renderPanel();
    await selectAndPreview();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply to 1 event' })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 event' }));

    // The Apply button only opens the gate — still one call, the dry run.
    expect(pushTemplateProduction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/no undo/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, push now' }));

    await waitFor(() => expect(pushTemplateProduction).toHaveBeenCalledTimes(2));
    expect(pushTemplateProduction).toHaveBeenLastCalledWith({
      templateId: TEMPLATE_ID,
      eventIds: ['e1'],
      include: { production: true, stageProduction: true },
      dryRun: false,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/1 change written to 1 event/);
  });

  it('cancelling the confirmation writes nothing and keeps the preview', async () => {
    renderPanel();
    await selectAndPreview();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply to 1 event' })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(pushTemplateProduction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Apply to 1 event' })).toBeEnabled();
  });
});
