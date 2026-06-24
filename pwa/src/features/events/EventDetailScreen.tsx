import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { formatDateRange } from '@/lib/dates/formatting';
import type { EventInput } from '@/lib/events/event';
import { listDepartments } from '@/lib/departments/departments-service';
import { generatePacket, getEvent, updateEvent } from './events-service';
import { EventForm } from './EventForm';
import { EventStatusBadge } from './EventStatusBadge';
import { StagesPanel } from './StagesPanel';
import { EventContactsPanel } from './EventContactsPanel';

const logger = createLogger('Events');

export function EventDetailScreen() {
  const { eventId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const eventQuery = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const update = useMutation({
    mutationFn: (input: EventInput) => updateEvent(eventId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      setEditing(false);
    },
    onError: (err) => logger.error('Failed to update event', err),
  });

  const packet = useMutation({
    mutationFn: () => generatePacket(eventId!),
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: (err) => logger.error('Failed to generate packet', err),
  });

  if (!user || !eventId) return null;

  const viewer = { uid: user.uid, isAdmin, isOrganizer };
  const canEdit = canEditEvent(viewer, roleQuery.data ?? null);
  const event = eventQuery.data;

  return (
    <section className="space-y-6">
      <Link to="/events" className="text-sm text-ink-muted hover:text-accent">
        ← Events
      </Link>

      {eventQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {eventQuery.isError && <p className="text-sm text-accent">Failed to load this event.</p>}
      {eventQuery.data === null && <p className="text-sm text-ink-muted">Event not found, or you don’t have access.</p>}

      {event && !editing && (
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-black tracking-tight text-brand">{event.name}</h1>
              <EventStatusBadge status={event.status} />
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={`/events/${eventId}/production`}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
              >
                Production
              </Link>
              <Link
                to={`/tracker/${eventId}`}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
              >
                Tracker
              </Link>
              <button
                type="button"
                onClick={() => packet.mutate()}
                disabled={packet.isPending}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {packet.isPending ? 'Generating…' : 'Generate packet'}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          <p className="text-ink-muted">{formatDateRange(event.startDate, event.endDate)}</p>
          {event.venue && <p className="text-ink-muted">{event.venue}</p>}
          {packet.isError && <p className="text-sm text-accent">Could not generate the packet. Try again.</p>}
        </header>
      )}

      {event && editing && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <h2 className="mb-3 font-display text-lg font-bold text-brand">Edit event</h2>
          <EventForm
            initial={event}
            departments={departmentsQuery.data ?? []}
            submitLabel="Save changes"
            showStatus
            pending={update.isPending}
            error={update.isError ? 'Could not save changes.' : null}
            onSubmit={(input) => update.mutate(input)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {event && <StagesPanel eventId={eventId} canEdit={canEdit} />}

      {event && <EventContactsPanel eventId={eventId} uid={user.uid} canEdit={canEdit} />}
    </section>
  );
}
