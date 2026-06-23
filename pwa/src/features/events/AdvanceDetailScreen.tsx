import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { formatDate } from '@/lib/dates/formatting';
import {
  canFinalizeSection,
  canUnlockSection,
  type SectionKey,
  type SectionStatus,
} from '@/lib/advances/sections';
import type { AdvanceInput } from '@/lib/advances/advance';
import { listDepartments } from '@/lib/departments/departments-service';
import { deleteAdvance, getAdvance, updateAdvance, updateSectionStatus } from './advances-service';
import { getEvent } from './events-service';
import { AdvanceForm } from './AdvanceForm';
import { SectionStatusBadge } from './SectionStatusBadge';

const logger = createLogger('Advances');

export function AdvanceDetailScreen() {
  const { eventId, stageId, advanceId } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const advanceQuery = useQuery({
    queryKey: ['advances', eventId, stageId, advanceId],
    queryFn: () => getAdvance(eventId!, stageId!, advanceId!),
    enabled: !!eventId && !!stageId && !!advanceId,
  });

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });

  const eventQuery = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEvent(eventId!),
    enabled: !!eventId,
  });

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['advances', eventId, stageId] });
  };

  const update = useMutation({
    mutationFn: (input: AdvanceInput) => updateAdvance(eventId!, stageId!, advanceId!, input),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
    onError: (err) => logger.error('Failed to update advance', err),
  });

  const remove = useMutation({
    mutationFn: () => deleteAdvance(eventId!, stageId!, advanceId!),
    onSuccess: () => {
      invalidate();
      navigate(`/events/${eventId}/stages/${stageId}`);
    },
    onError: (err) => logger.error('Failed to delete advance', err),
  });

  const setStatus = useMutation({
    mutationFn: ({ key, status }: { key: SectionKey; status: SectionStatus }) =>
      updateSectionStatus(eventId!, stageId!, advanceId!, key, status, user!.uid),
    onSuccess: () => invalidate(),
    onError: (err) => logger.error('Failed to update section status', err),
  });

  if (!user || !eventId || !stageId || !advanceId) return null;

  const viewer = { uid: user.uid, isAdmin, isOrganizer };
  const role = roleQuery.data ?? null;
  const canEdit = canEditEvent(viewer, role);
  const canFinalize = canFinalizeSection(viewer, role);
  const canUnlock = canUnlockSection(viewer, role);
  const advance = advanceQuery.data;

  // One section per enabled department (ordered), status from the advance.
  const departments = departmentsQuery.data ?? [];
  const enabledIds = new Set(eventQuery.data?.departmentIds ?? []);
  const sectionRows = departments.filter((d) => enabledIds.has(d.id));

  return (
    <section className="space-y-6">
      <Link to={`/events/${eventId}/stages/${stageId}`} className="text-sm text-ink-muted hover:text-accent">
        ← Stage
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
          <div className="space-y-1 pt-1">
            <SummaryField label="Additions" value={advance.additions} />
            <SummaryField label="Concerns" value={advance.concerns} />
            <SummaryField label="Pending" value={advance.pending} />
          </div>
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
          {sectionRows.length === 0 && (
            <p className="text-sm text-ink-muted">No departments enabled for this event.</p>
          )}
          <ul className="divide-y divide-line/60">
            {sectionRows.map((dept) => {
              const state = advance.sections[dept.id] ?? {
                status: 'not_started' as const,
                finalizedAt: null,
                finalizedBy: null,
              };
              const pending = setStatus.isPending;
              return (
                <li key={dept.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="font-medium text-ink">{dept.name}</span>
                  <div className="flex items-center gap-2">
                    {state.status === 'complete' && state.finalizedAt && (
                      <span className="text-xs text-ink-muted">Locked {formatDate(state.finalizedAt)}</span>
                    )}
                    <SectionStatusBadge status={state.status} />
                    {state.status === 'not_started' && canEdit && (
                      <SectionActionButton label="Start" pending={pending} onClick={() => setStatus.mutate({ key: dept.id, status: 'in_progress' })} />
                    )}
                    {state.status === 'in_progress' && canFinalize && (
                      <SectionActionButton label="Finalize" pending={pending} onClick={() => setStatus.mutate({ key: dept.id, status: 'complete' })} />
                    )}
                    {state.status === 'complete' && canUnlock && (
                      <SectionActionButton label="Unlock" pending={pending} onClick={() => setStatus.mutate({ key: dept.id, status: 'in_progress' })} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-muted">Per-department content fields arrive in Phase 4.</p>
        </div>
      )}
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="text-sm">
      <span className="font-semibold text-ink">{label}:</span>{' '}
      <span className="whitespace-pre-line text-ink-muted">{value}</span>
    </p>
  );
}

function SectionActionButton({
  label,
  pending,
  onClick,
}: {
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
