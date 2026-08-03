import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { AdminScreen } from './AdminScreen';

// The point of these tests is the tab SHELL: mock every section (and the always-visible
// pending panel / observability footer) so no Firebase-backed queries fire and each
// section reduces to a findable marker.
vi.mock('./PendingApprovalPanel', () => ({
  PendingApprovalPanel: () => <div data-testid="pending-approval" />,
}));
vi.mock('./UsersAdmin', () => ({ UsersAdmin: () => <div data-testid="users-admin" /> }));
vi.mock('./EventMembershipAdmin', () => ({
  EventMembershipAdmin: () => <div data-testid="event-membership-admin" />,
}));
vi.mock('./FestivalsAdmin', () => ({
  FestivalsAdmin: () => <div data-testid="festivals-admin" />,
}));
vi.mock('./DepartmentsAdmin', () => ({
  DepartmentsAdmin: () => <div data-testid="departments-admin" />,
}));
vi.mock('./TemplatesAdmin', () => ({
  TemplatesAdmin: () => <div data-testid="templates-admin" />,
}));
vi.mock('./ScheduleTemplatesAdmin', () => ({
  ScheduleTemplatesAdmin: () => <div data-testid="schedule-templates-admin" />,
}));
vi.mock('./ChecklistTemplatesAdmin', () => ({
  ChecklistTemplatesAdmin: () => <div data-testid="checklist-templates-admin" />,
}));
vi.mock('./CrewTypesAdmin', () => ({
  CrewTypesAdmin: () => <div data-testid="crew-types-admin" />,
}));
vi.mock('./DocumentCategoriesAdmin', () => ({
  DocumentCategoriesAdmin: () => <div data-testid="document-categories-admin" />,
}));
vi.mock('./DocumentLibraryAdmin', () => ({
  DocumentLibraryAdmin: () => <div data-testid="document-library-admin" />,
}));
vi.mock('./BrandingAdmin', () => ({ BrandingAdmin: () => <div data-testid="branding-admin" /> }));
vi.mock('./PacketNamingAdmin', () => ({
  PacketNamingAdmin: () => <div data-testid="packet-naming-admin" />,
}));
vi.mock('./ObservabilityDiagnostics', () => ({
  ObservabilityDiagnostics: () => <div data-testid="observability-diagnostics" />,
}));

/** MemoryRouter has no window.location — expose the router's own for URL assertions. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function renderAdmin(initialEntry = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminScreen />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('AdminScreen tab shell', () => {
  it("renders the People & access sections by default, and no other tab's", () => {
    renderAdmin();

    expect(screen.getByRole('tab', { name: 'People & access' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('users-admin')).toBeInTheDocument();
    expect(screen.getByTestId('event-membership-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('branding-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('festivals-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-categories-admin')).not.toBeInTheDocument();
  });

  it('renders the documents sections for ?tab=documents', () => {
    renderAdmin('/admin?tab=documents');

    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('document-categories-admin')).toBeInTheDocument();
    expect(screen.getByTestId('document-library-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('users-admin')).not.toBeInTheDocument();
  });

  it('falls back to the default tab for an unknown ?tab= value', () => {
    renderAdmin('/admin?tab=nonsense');

    expect(screen.getByRole('tab', { name: 'People & access' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('users-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('branding-admin')).not.toBeInTheDocument();
  });

  it('sets the ?tab= param and swaps sections when a tab is clicked', () => {
    renderAdmin();
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/admin?tab=documents');
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('document-categories-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('users-admin')).not.toBeInTheDocument();
  });

  it('moves focus and selection with ArrowRight, wrapping with ArrowLeft', () => {
    renderAdmin();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'People & access' }), {
      key: 'ArrowRight',
    });
    const eventSetup = screen.getByRole('tab', { name: 'Event setup' });
    expect(eventSetup).toHaveAttribute('aria-selected', 'true');
    expect(eventSetup).toHaveFocus();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin?tab=event-setup');
    expect(screen.getByTestId('festivals-admin')).toBeInTheDocument();

    // ArrowLeft from the first tab wraps to the last.
    fireEvent.keyDown(eventSetup, { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'People & access' }), {
      key: 'ArrowLeft',
    });
    const branding = screen.getByRole('tab', { name: 'Branding & output' });
    expect(branding).toHaveAttribute('aria-selected', 'true');
    expect(branding).toHaveFocus();
    expect(screen.getByTestId('branding-admin')).toBeInTheDocument();
  });

  it('uses a roving tabindex: only the selected tab is in the tab order', () => {
    renderAdmin('/admin?tab=documents');

    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'People & access' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Event setup' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Branding & output' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('keeps the pending panel and observability footer visible on every tab', () => {
    renderAdmin('/admin?tab=branding');

    expect(screen.getByTestId('pending-approval')).toBeInTheDocument();
    expect(screen.getByTestId('observability-diagnostics')).toBeInTheDocument();
    // The tabpanel is labelled by the active tab.
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Branding & output');
  });

  it('has no axe-detectable violations', async () => {
    const { container } = renderAdmin();
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
