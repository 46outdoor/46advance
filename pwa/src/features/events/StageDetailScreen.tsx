import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import type { StageInput } from '@/lib/events/stage';
import { deleteStage, getStage, updateStage } from './stages-service';
import { StageForm } from './StageForm';
import { StageProductionPanel } from './StageProductionPanel';
import { AdvancesPanel } from './AdvancesPanel';
import { useResolvedEvent } from './useResolvedEvent';

const logger = createLogger('Stages');

export function StageDetailScreen() {
  const { eventId: eventParam, stageId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Resolve slug-or-id → canonical event id so stage/role reads + panels use the doc id.
  const { eventId } = useResolvedEvent(eventParam);

  const stageQuery = useQuery({
    queryKey: ['stages', eventId, stageId],
    queryFn: () => getStage(eventId!, stageId!),
    enabled: !!eventId && !!stageId,
  });

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });

  const update = useMutation({
    mutationFn: (input: StageInput) => updateStage(eventId!, stageId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stages', eventId] });
      setEditing(false);
    },
    onError: (err) => logger.error('Failed to update stage', err),
  });

  const remove = useMutation({
    mutationFn: () => deleteStage(eventId!, stageId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stages', eventId] });
      navigate(`/events/${eventParam}`);
    },
    onError: (err) => logger.error('Failed to delete stage', err),
  });

  if (!user || !eventParam || !stageId) return null;

  const viewer = { uid: user.uid, isAdmin, isOrganizer };
  const canEdit = canEditEvent(viewer, roleQuery.data ?? null);
  const stage = stageQuery.data;

  return (
    <section className="space-y-6">
      <Link to={`/events/${eventParam}`} className="text-sm text-ink-muted hover:text-accent">
        ← Event
      </Link>

      {stageQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {stageQuery.isError && <p className="text-sm text-accent">Failed to load this stage.</p>}
      {stageQuery.data === null && (
        <p className="text-sm text-ink-muted">Stage not found, or you don’t have access.</p>
      )}

      {stage && !editing && (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-brand">
              {stage.name}
            </h1>
            {stage.notes && <p className="mt-1 text-ink-muted">{stage.notes}</p>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
                className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </div>
          )}
        </header>
      )}

      {stage && editing && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <h2 className="mb-3 font-display text-lg font-bold text-brand">Edit stage</h2>
          <StageForm
            initial={stage}
            submitLabel="Save changes"
            pending={update.isPending}
            error={update.isError ? 'Could not save changes.' : null}
            onSubmit={(input) => update.mutate(input)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {stage && eventId && (
        <StageProductionPanel eventId={eventId} stageId={stageId} role={roleQuery.data ?? null} />
      )}
      {stage && eventId && <AdvancesPanel eventId={eventId} stageId={stageId} canEdit={canEdit} />}
    </section>
  );
}
