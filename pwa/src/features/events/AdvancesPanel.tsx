import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { SECTION_KEYS } from '@/lib/advances/sections';
import { formatDate } from '@/lib/dates/formatting';
import type { Advance, AdvanceInput } from '@/lib/advances/advance';
import { createAdvance, listAdvances } from './advances-service';
import { AdvanceForm } from './AdvanceForm';

const logger = createLogger('Advances');

function completeCount(a: Advance): number {
  return SECTION_KEYS.filter((k) => a.sections[k].status === 'complete').length;
}

/** Advances list + create, embedded on the event detail page. */
export function AdvancesPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const advancesQuery = useQuery({
    queryKey: ['advances', eventId],
    queryFn: () => listAdvances(eventId),
  });

  const create = useMutation({
    mutationFn: (input: AdvanceInput) => createAdvance(eventId, input, user!.uid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['advances', eventId] });
      setShowCreate(false);
    },
    onError: (err) => logger.error('Failed to create advance', err),
  });

  const advances = advancesQuery.data ?? [];

  return (
    <div className="space-y-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Advances</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            {showCreate ? 'Close' : 'Add advance'}
          </button>
        )}
      </div>

      {showCreate && canEdit && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <AdvanceForm
            submitLabel="Add advance"
            pending={create.isPending}
            error={create.isError ? 'Could not add the advance.' : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {advancesQuery.isLoading && <p className="text-sm text-ink-muted">Loading advances…</p>}
      {advancesQuery.isError && <p className="text-sm text-accent">Failed to load advances.</p>}
      {advancesQuery.data && advances.length === 0 && (
        <p className="text-sm text-ink-muted">No advances yet.</p>
      )}

      <ul className="divide-y divide-line/60">
        {advances.map((a) => (
          <li key={a.id}>
            <Link
              to={`/events/${eventId}/advances/${a.id}`}
              className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-accent"
            >
              <span>
                <span className="font-semibold text-ink">{a.artistName}</span>
                {a.stage && <span className="ml-2 text-sm text-ink-muted">{a.stage}</span>}
                {a.performanceDate && (
                  <span className="ml-2 text-sm text-ink-muted">{formatDate(a.performanceDate)}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {completeCount(a)}/{SECTION_KEYS.length} complete
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
