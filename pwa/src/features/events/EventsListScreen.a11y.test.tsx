import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateRecord } from '@/lib/templates/template';
import { listTemplates } from '@/lib/templates/templates-service';
import { EventsListScreen } from './EventsListScreen';

/** Mutable so a test can render as an organizer (who gets the create form) vs. a plain member. */
const auth = vi.hoisted(() => ({
  user: { uid: 'pm-1' },
  isAdmin: false,
  isOrganizer: false,
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));

vi.mock('./events-service', () => ({
  createEvent: vi.fn(),
  createEventFromTemplate: vi.fn(),
}));

// listEvents moved to the shared lib read module (a feature may not import another feature).
vi.mock('@/lib/events/events-read', () => ({
  listEvents: vi.fn(async () => [
    {
      id: 'event-1',
      name: 'Accessible Festival',
      slug: 'accessible-festival',
      status: 'active',
      venue: 'Riverfront',
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
      googleCalendarId: null,
      eventLogo: null,
      createdBy: 'admin-1',
      createdAt: null,
      updatedAt: null,
    },
  ]),
}));

vi.mock('@/lib/departments/departments-service', () => ({
  listDepartments: vi.fn(async () => []),
}));

vi.mock('@/lib/templates/templates-service', () => ({
  listTemplates: vi.fn(),
}));

vi.mock('@/lib/schedules/schedule-templates-service', () => ({
  getDefaultMasterTemplate: vi.fn(async () => null),
  listScheduleTemplates: vi.fn(async () => []),
}));

vi.mock('./stages-service', () => ({
  listStages: vi.fn(async () => []),
}));

vi.mock('./schedule-days-service', () => ({
  applyTemplateDaysToEvent: vi.fn(),
}));

function template(id: string, name: string, isDefault: boolean): TemplateRecord {
  return {
    id,
    name,
    departmentIds: [],
    stages: [],
    eventProduction: { info: {}, contacts: [], links: [] },
    stageProduction: {},
    members: [],
    scheduleTemplateIds: [],
    eventLogo: null,
    isDefault,
    createdAt: null,
    updatedAt: null,
  };
}

/** Every "Bring over" checkbox, in render order. */
const SECTIONS = [
  'Production record',
  'Stages & house packages',
  'Departments',
  'Default roles',
  'Event logo',
  'Schedule templates',
];

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventsListScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Open the create panel as an organizer and return the template picker. */
async function openCreateForm(): Promise<HTMLSelectElement> {
  renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: 'New event' }));
  return (await screen.findByLabelText('Start from template (optional)')) as HTMLSelectElement;
}

describe('EventsListScreen accessibility', () => {
  beforeEach(() => {
    auth.isAdmin = false;
    auth.isOrganizer = false;
    vi.mocked(listTemplates).mockResolvedValue([
      template('tpl-master', 'Master house package', true),
      template('tpl-club', 'Club show', false),
    ]);
  });

  it('has no axe-detectable violations for an authenticated event member', async () => {
    const { container } = renderScreen();
    await screen.findByRole('heading', { name: 'Accessible Festival' });
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('has no axe-detectable violations with the create-from-template form open', async () => {
    auth.isOrganizer = true;
    const { container } = renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'New event' }));
    await screen.findByLabelText('Start from template (optional)');
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('pre-selects the template flagged as default and marks it in the picker', async () => {
    auth.isOrganizer = true;
    const select = await openCreateForm();

    expect(select.value).toBe('tpl-master');
    expect(
      screen.getByRole('option', { name: 'Master house package (default)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Club show' })).toBeInTheDocument();
    // "Blank event" stays available as the explicit opt-out.
    expect(screen.getByRole('option', { name: 'Blank event' })).toBeInTheDocument();
  });

  it('offers every blueprint section, checked, while a template is selected', async () => {
    auth.isOrganizer = true;
    await openCreateForm();

    const group = screen.getByRole('group', { name: 'Bring over' });
    for (const label of SECTIONS) {
      expect(within(group).getByLabelText(label)).toBeChecked();
    }
    expect(within(group).getAllByRole('checkbox')).toHaveLength(SECTIONS.length);
  });

  it('unchecks a single section without touching the others', async () => {
    auth.isOrganizer = true;
    await openCreateForm();

    const group = screen.getByRole('group', { name: 'Bring over' });
    fireEvent.click(within(group).getByLabelText('Schedule templates'));

    expect(within(group).getByLabelText('Schedule templates')).not.toBeChecked();
    expect(within(group).getByLabelText('Production record')).toBeChecked();
  });

  it('hides the section checkboxes when "Blank event" is chosen', async () => {
    auth.isOrganizer = true;
    const select = await openCreateForm();

    expect(screen.getByRole('group', { name: 'Bring over' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '' } });

    expect(select.value).toBe('');
    expect(screen.queryByRole('group', { name: 'Bring over' })).not.toBeInTheDocument();
  });
});
