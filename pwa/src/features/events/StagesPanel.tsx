import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import type { StageInput } from '@/lib/events/stage';
import { createStage, listStages } from './stages-service';
import { StageForm } from './StageForm';

const logger = createLogger('Stages');

/** Stages list + create, embedded on the event detail page. */
export function StagesPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const stagesQuery = useQuery({ queryKey: ['stages', eventId], queryFn: () => listStages(eventId) });

  const create = useMutation({
    mutationFn: (input: StageInput) => createStage(eventId, input, stagesQuery.data?.length ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stages', eventId] });
      setShowCreate(false);
    },
    onError: (err) => logger.error('Failed to create stage', err),
  });

  const stages = stagesQuery.data ?? [];

  return (
    <div className="space-y-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-brand">Stages</h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
          >
            {showCreate ? 'Close' : 'Add stage'}
          </button>
        )}
      </div>

      {showCreate && canEdit && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <StageForm
            submitLabel="Add stage"
            pending={create.isPending}
            error={create.isError ? 'Could not add the stage.' : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {stagesQuery.isLoading && <p className="text-sm text-ink-muted">Loading stages…</p>}
      {stagesQuery.isError && <p className="text-sm text-accent">Failed to load stages.</p>}
      {stagesQuery.data && stages.length === 0 && <p className="text-sm text-ink-muted">No stages yet.</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {stages.map((s) => (
          <li key={s.id}>
            <Link
              to={`/events/${eventId}/stages/${s.id}`}
              className="block rounded-lg border border-line p-4 transition-colors hover:border-accent"
            >
              <h3 className="font-display text-lg font-bold text-brand">{s.name}</h3>
              {s.notes && <p className="mt-1 text-sm text-ink-muted">{s.notes}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
