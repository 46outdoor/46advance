import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { slotLabel, type Advance, type AdvanceInput } from '@/lib/advances/advance';
import { eventDays } from '@/lib/events/event';
import { APP_TIME_ZONE, formatZonedDate } from '@/lib/dates/timezone';
import { createAdvance, listAdvances } from './advances-service';
import { getEvent } from './events-service';
import { AdvanceForm } from './AdvanceForm';

const logger = createLogger('Advances');

function sectionProgress(a: Advance): { complete: number; total: number } {
  const keys = Object.keys(a.sections);
  return {
    complete: keys.filter((k) => a.sections[k].status === 'complete').length,
    total: keys.length,
  };
}

/** Advances list + create, embedded on the stage detail page. */
export function AdvancesPanel({
  eventId,
  stageId,
  canEdit,
}: {
  eventId: string;
  stageId: string;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const advancesQuery = useQuery({
    queryKey: ['advances', eventId, stageId],
    queryFn: () => listAdvances(eventId, stageId),
  });

  // Enabled departments seed a new advance's sections.
  const eventQuery = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEvent(eventId),
  });

  const create = useMutation({
    mutationFn: (input: AdvanceInput) =>
      createAdvance(eventId, stageId, input, eventQuery.data?.departmentIds ?? [], user!.uid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['advances', eventId, stageId] });
      setShowCreate(false);
    },
    onError: (err) => logger.error('Failed to create advance', err),
  });

  const advances = advancesQuery.data ?? [];

  return (
    <div className="space-y-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Artist Advances</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            {showCreate ? 'Close' : 'Add artist advance'}
          </button>
        )}
      </div>

      {showCreate && canEdit && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <AdvanceForm
            days={eventDays(
              eventQuery.data?.startDate,
              eventQuery.data?.endDate,
              eventQuery.data?.timeZone ?? APP_TIME_ZONE,
            )}
            timeZone={eventQuery.data?.timeZone ?? APP_TIME_ZONE}
            submitLabel="Add artist advance"
            pending={create.isPending}
            error={create.isError ? 'Could not add the advance.' : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {advancesQuery.isLoading && (
        <p className="text-sm text-ink-muted">Loading artist advances…</p>
      )}
      {advancesQuery.isError && (
        <p className="text-sm text-accent">Failed to load artist advances.</p>
      )}
      {advancesQuery.data && advances.length === 0 && (
        <p className="text-sm text-ink-muted">No artist advances yet.</p>
      )}

      <ul className="divide-y divide-line/60">
        {advances.map((a) => (
          <li key={a.id}>
            <Link
              to={`/events/${eventId}/stages/${stageId}/advances/${a.id}`}
              className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-accent"
            >
              <span>
                <span className="font-semibold text-ink">{a.artistName}</span>
                {a.slot && <span className="ml-2 text-sm text-ink-muted">{slotLabel(a.slot)}</span>}
                {a.performanceDate && (
                  <span className="ml-2 text-sm text-ink-muted">
                    {formatZonedDate(a.performanceDate, eventQuery.data?.timeZone ?? APP_TIME_ZONE)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {sectionProgress(a).complete}/{sectionProgress(a).total} complete
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
