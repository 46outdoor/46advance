import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { EventsListScreen } from './EventsListScreen';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'pm-1' },
    isAdmin: false,
    isOrganizer: false,
  }),
}));

vi.mock('./events-service', () => ({
  createEvent: vi.fn(),
  createEventFromTemplate: vi.fn(),
  listEvents: vi.fn(async () => [
    {
      id: 'event-1',
      name: 'Accessible Festival',
      slug: 'accessible-festival',
      status: 'active',
      venue: 'Riverfront',
      startDate: new Date('2026-08-15T05:00:00.000Z'),
      endDate: new Date('2026-08-17T05:00:00.000Z'),
      loadInDays: 0,
      loadOutDays: 0,
      timeZone: 'America/Chicago',
      departmentIds: [],
      driveFolderId: null,
      driveFolderName: null,
      packetDrive: null,
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
  listTemplates: vi.fn(async () => []),
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

describe('EventsListScreen accessibility', () => {
  it('has no axe-detectable violations for an authenticated event member', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EventsListScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Accessible Festival' });
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
