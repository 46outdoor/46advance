import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canCreateEvents } from '@/lib/rbac/permissions';
import { EVENT_STATUSES, type EventInput, type EventStatus } from '@/lib/events/event';
import { listDepartments } from '@/lib/departments/departments-service';
import { listTemplates } from '@/lib/templates/templates-service';
import type { TemplateRecord } from '@/lib/templates/template';
import { APP_TIME_ZONE, formatZonedDateRange } from '@/lib/dates/timezone';
import { resolveTemplateDays } from '@/lib/schedules/scheduleTemplate';
import {
  getDefaultMasterTemplate,
  listScheduleTemplates,
} from '@/lib/schedules/schedule-templates-service';
import { createEvent, createEventFromTemplate, listEvents } from './events-service';
import { applyTemplateDaysToEvent } from './schedule-days-service';
import { listStages } from './stages-service';
import { filterEvents } from './filter-events';
import { EventForm } from './EventForm';
import { EventStatusBadge } from './EventStatusBadge';

const logger = createLogger('Events');

/** Decision 23 (SCHEDULE_REDESIGN): after creating an event, the default master schedule
 * template auto-applies only when the chosen event template didn't supply schedule
 * templates itself (or no event template was used). Best-effort — a failure here never
 * fails the creation; the schedule can be imported manually later. */
async function applyDefaultMasterSchedule(
  eventId: string,
  input: EventInput,
  templateId: string,
  eventTemplates: readonly TemplateRecord[],
  uid: string,
): Promise<void> {
  try {
    const chosen = templateId ? eventTemplates.find((t) => t.id === templateId) : undefined;
    if (chosen && chosen.scheduleTemplateIds.length > 0) return; // the event template wins
    if (!input.startDate) return; // offsets have no anchor without a start date
    const master = await getDefaultMasterTemplate();
    if (!master) return;
    const all = await listScheduleTemplates();
    const resolved = resolveTemplateDays(master, new Map(all.map((t) => [t.id, t])));
    if (resolved.length === 0) return;
    const stages = await listStages(eventId);
    await applyTemplateDaysToEvent(
      eventId,
      resolved,
      input.startDate,
      input.timeZone ?? APP_TIME_ZONE,
      stages,
      uid,
    );
  } catch (e) {
    logger.error('Failed to auto-apply the default master schedule', e);
  }
}

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
    mutationFn: async (input: EventInput) => {
      const id = templateId
        ? await createEventFromTemplate(templateId, input)
        : await createEvent(input);
      await applyDefaultMasterSchedule(id, input, templateId, templatesQuery.data ?? [], viewer!.uid);
      return id;
    },
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
        <div className="flex items-center gap-2">
          <Link
            to="/tracker"
            className="rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Tracker
          </Link>
          {canCreateEvents(viewer) && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {showCreate ? 'Close' : 'New event'}
            </button>
          )}
        </div>
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
                statusFilter === s ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
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
              to={`/events/${e.slug ?? e.id}`}
              className="block rounded-lg border border-line p-4 transition-colors hover:border-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-brand">{e.name}</h2>
                <EventStatusBadge status={e.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {formatZonedDateRange(e.startDate, e.endDate, e.timeZone ?? APP_TIME_ZONE)}
              </p>
              {e.venue && <p className="text-sm text-ink-muted">{e.venue}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
