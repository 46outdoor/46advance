import { useRef, type KeyboardEvent, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ADMIN_TABS, parseAdminTab, type AdminTabId } from '@/lib/admin/tabs';
import { PendingApprovalPanel } from './PendingApprovalPanel';
import { UsersAdmin } from './UsersAdmin';
import { EventMembershipAdmin } from './EventMembershipAdmin';
import { FestivalsAdmin } from './FestivalsAdmin';
import { DepartmentsAdmin } from './DepartmentsAdmin';
import { TemplatesAdmin } from './TemplatesAdmin';
import { ScheduleTemplatesAdmin } from './ScheduleTemplatesAdmin';
import { CrewTypesAdmin } from './CrewTypesAdmin';
import { ChecklistTemplatesAdmin } from './ChecklistTemplatesAdmin';
import { DocumentCategoriesAdmin } from './DocumentCategoriesAdmin';
import { DocumentLibraryAdmin } from './DocumentLibraryAdmin';
import { BrandingAdmin } from './BrandingAdmin';
import { PacketNamingAdmin } from './PacketNamingAdmin';
import { ObservabilityDiagnostics } from './ObservabilityDiagnostics';

const tabId = (id: AdminTabId) => `admin-tab-${id}`;
const TABPANEL_ID = 'admin-tabpanel';

/**
 * Tab bar with real tab semantics: roving tabindex, ArrowLeft/ArrowRight moves both
 * focus and selection (wrapping), 44px targets. The selected tab wears the dark
 * brand chrome; the rest match the app's standard bordered-button idiom.
 */
function AdminTabBar({
  active,
  onSelect,
}: {
  active: AdminTabId;
  onSelect: (id: AdminTabId) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + ADMIN_TABS.length) % ADMIN_TABS.length;
    onSelect(ADMIN_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Admin sections"
      className="flex flex-wrap gap-2 border-b border-line pb-3"
    >
      {ADMIN_TABS.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={selected}
            aria-controls={TABPANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`min-h-11 rounded border px-4 py-2 text-sm transition-colors ${
              selected
                ? 'border-brand bg-brand font-semibold text-brand-fg'
                : 'border-line hover:border-accent hover:text-accent'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The active tab's sections — only these mount, so inactive sections' queries never
 * fire. Grouping per planning/ADMIN_NAVIGATION.md.
 */
function TabSections({ tab }: { tab: AdminTabId }): ReactElement {
  switch (tab) {
    case 'people':
      return (
        <>
          <UsersAdmin />
          <EventMembershipAdmin />
        </>
      );
    case 'event-setup':
      return (
        <>
          <FestivalsAdmin />
          <DepartmentsAdmin />
          <TemplatesAdmin />
          <ScheduleTemplatesAdmin />
          <CrewTypesAdmin />
          <ChecklistTemplatesAdmin />
        </>
      );
    case 'documents':
      return (
        <>
          <DocumentCategoriesAdmin />
          <DocumentLibraryAdmin />
        </>
      );
    case 'branding':
      return (
        <>
          <BrandingAdmin />
          <PacketNamingAdmin />
        </>
      );
  }
}

/**
 * Admin shell (planning/ADMIN_NAVIGATION.md): four tabs driven by the `?tab=` search
 * param — linkable, back-button-friendly, unknown values fall back to the default.
 * Pending approval renders above the tabs (always visible: those accounts are locked
 * out); Observability renders below the tabpanel (a diagnostic, not a setting).
 */
export function AdminScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseAdminTab(searchParams.get('tab'));

  // replace: false so back/forward walk the visited tabs.
  const selectTab = (id: AdminTabId) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
      },
      { replace: false },
    );

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">Admin</h1>
        <p className="text-sm text-ink-muted">
          Users and per-event role assignment. Membership is admin-managed (Phase 1).
        </p>
      </header>

      <PendingApprovalPanel />

      <AdminTabBar active={activeTab} onSelect={selectTab} />

      <div
        role="tabpanel"
        id={TABPANEL_ID}
        aria-labelledby={tabId(activeTab)}
        className="space-y-10"
      >
        <TabSections tab={activeTab} />
      </div>

      <footer className="border-t border-line/60 pt-6">
        <ObservabilityDiagnostics />
      </footer>
    </section>
  );
}
