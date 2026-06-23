import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { formatDate } from '@/lib/dates/formatting';
import { SECTION_KEYS, SECTION_LABELS } from '@/lib/advances/sections';
import type { AdvanceInput } from '@/lib/advances/advance';
import { deleteAdvance, getAdvance, updateAdvance } from './advances-service';
import { AdvanceForm } from './AdvanceForm';
import { SectionStatusBadge } from './SectionStatusBadge';

const logger = createLogger('Advances');

export function AdvanceDetailScreen() {
  const { eventId, advanceId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const advanceQuery = useQuery({
    queryKey: ['advances', eventId, advanceId],
    queryFn: () => getAdvance(eventId!, advanceId!),
    enabled: !!eventId && !!advanceId,
  });

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['advances', eventId] });
  };

  const update = useMutation({
    mutationFn: (input: AdvanceInput) => updateAdvance(eventId!, advanceId!, input),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
    onError: (err) => logger.error('Failed to update advance', err),
  });

  const remove = useMutation({
    mutationFn: () => deleteAdvance(eventId!, advanceId!),
    onSuccess: () => {
      invalidate();
      navigate(`/events/${eventId}`);
    },
    onError: (err) => logger.error('Failed to delete advance', err),
  });

  if (!user || !eventId || !advanceId) return null;

  const viewer = { uid: user.uid, isAdmin, isOrganizer };
  const canEdit = canEditEvent(viewer, roleQuery.data ?? null);
  const advance = advanceQuery.data;

  return (
    <section className="space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-ink-muted hover:text-accent">
        ← Event
      </Link>

      {advanceQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {advanceQuery.isError && <p className="text-sm text-accent">Failed to load this advance.</p>}
      {advanceQuery.data === null && (
        <p className="text-sm text-ink-muted">Advance not found, or you don’t have access.</p>
      )}

      {advance && !editing && (
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-black tracking-tight text-brand">{advance.artistName}</h1>
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
          </div>
          <p className="text-ink-muted">
            {advance.stage && <span className="mr-3">{advance.stage}</span>}
            {advance.performanceDate && <span>{formatDate(advance.performanceDate)}</span>}
          </p>
          {advance.notes && <p className="whitespace-pre-line text-sm text-ink">{advance.notes}</p>}
        </header>
      )}

      {advance && editing && (
        <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
          <h2 className="mb-3 font-display text-lg font-bold text-brand">Edit advance</h2>
          <AdvanceForm
            initial={advance}
            submitLabel="Save changes"
            pending={update.isPending}
            error={update.isError ? 'Could not save changes.' : null}
            onSubmit={(input) => update.mutate(input)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {advance && (
        <div className="space-y-2 border-t border-line pt-6">
          <h2 className="font-display text-xl font-bold text-brand">Sections</h2>
          <ul className="divide-y divide-line/60">
            {SECTION_KEYS.map((key) => {
              const state = advance.sections[key];
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium text-ink">{SECTION_LABELS[key]}</span>
                  <SectionStatusBadge status={state.status} />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-muted">
            Section content (transportation, schedules) arrives in Phase 4; finalize/lock controls in 2.4.
          </p>
        </div>
      )}
    </section>
  );
}
