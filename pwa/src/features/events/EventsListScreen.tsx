import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canCreateEvents } from '@/lib/rbac/permissions';
import { formatDateRange } from '@/lib/dates/formatting';
import { EVENT_STATUSES, type EventInput, type EventStatus } from '@/lib/events/event';
import { listDepartments } from '@/lib/departments/departments-service';
import { listTemplates } from '@/lib/templates/templates-service';
import { createEvent, createEventFromTemplate, listEvents } from './events-service';
import { filterEvents } from './filter-events';
import { EventForm } from './EventForm';
import { EventStatusBadge } from './EventStatusBadge';

const logger = createLogger('Events');

export function EventsListScreen() {
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | EventStatus>('all');
  const [search, setSearch] = useState('');
  const [templateId, setTemplateId] = useState('');

  const viewer = user ? { uid: user.uid, isAdmin, isOrganizer } : null;

  const eventsQuery = useQuery({
    queryKey: ['events', 'list', viewer?.uid, isAdmin],
    queryFn: () => listEvents(viewer!),
    enabled: !!viewer,
  });

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });
  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });

  const create = useMutation({
    mutationFn: (input: EventInput) =>
      templateId ? createEventFromTemplate(templateId, input) : createEvent(input, viewer!.uid),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowCreate(false);
      setTemplateId('');
      navigate(`/events/${id}`);
    },
    onError: (err) => logger.error('Failed to create event', err),
  });

  if (!viewer) return null;

  const events = filterEvents(eventsQuery.data ?? [], statusFilter, search);
  const isFiltering = statusFilter !== 'all' || search.trim() !== '';

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">Events</h1>
        {canCreateEvents(viewer) && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {showCreate ? 'Close' : 'New event'}
          </button>
        )}
      </header>

      {showCreate && canCreateEvents(viewer) && (
        <div className="space-y-3 rounded-lg border border-line bg-surface-muted/40 p-4">
          {(templatesQuery.data ?? []).length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-ink">Start from template (optional)</span>
              <select
                className="w-72 rounded border border-line px-3 py-2 outline-none focus:border-brand"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Blank event</option>
                {(templatesQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {templateId && (
                <span className="mt-1 block text-xs text-ink-muted">
                  Departments, stages, production, and roles come from the template.
                </span>
              )}
            </label>
          )}
          <EventForm
            departments={departmentsQuery.data ?? []}
            submitLabel={templateId ? 'Create from template' : 'Create event'}
            pending={create.isPending}
            error={create.isError ? 'Could not create the event.' : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="block w-full sm:w-72">
          <span className="sr-only">Search events</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or venue…"
            className="min-h-[44px] w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">Filter:</span>
          {(['all', ...EVENT_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-0.5 capitalize transition-colors ${
                statusFilter === s ? 'bg-brand text-brand-fg' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {eventsQuery.isLoading && <p className="text-sm text-ink-muted">Loading events…</p>}
      {eventsQuery.isError && <p className="text-sm text-accent">Failed to load events.</p>}
      {eventsQuery.data &&
        events.length === 0 &&
        (isFiltering ? (
          <p className="text-sm text-ink-muted">No events match your search or filter.</p>
        ) : canCreateEvents(viewer) ? (
          <p className="text-sm text-ink-muted">No events yet. Use “New event” to create one.</p>
        ) : (
          <div className="rounded-lg border border-line p-4">
            <p className="font-semibold text-ink">You’re not on any events yet</p>
            <p className="mt-1 text-sm text-ink-muted">
              An admin needs to add you to an event before it appears here. Once you’re assigned a
              role on an event, it’ll show up on this page.
            </p>
          </div>
        ))}

      <ul className="grid gap-3 sm:grid-cols-2">
        {events.map((e) => (
          <li key={e.id}>
            <Link
              to={`/events/${e.id}`}
              className="block rounded-lg border border-line p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-brand">{e.name}</h2>
                <EventStatusBadge status={e.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">{formatDateRange(e.startDate, e.endDate)}</p>
              {e.venue && <p className="text-sm text-ink-muted">{e.venue}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
