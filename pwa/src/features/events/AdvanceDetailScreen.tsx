import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useViewer } from '@/lib/rbac/useViewer';
import { createLogger } from '@/lib/logger';
import { canEditDepartment, canEditEvent, type Viewer } from '@/lib/rbac/permissions';
import { getEventMember } from '@/lib/rbac/membership';
import type { EventMember } from '@/lib/rbac/roles';
import {
  canFinalizeSection,
  canUnlockSection,
  sectionStateFor,
  type SectionKey,
  type SectionStatus,
} from '@/lib/advances/sections';
import { slotLabel, type Advance, type AdvanceInput } from '@/lib/advances/advance';
import { eventDays, type EventRecord } from '@/lib/events/event';
import { APP_TIME_ZONE, formatZonedDate } from '@/lib/dates/timezone';
import type { SectionContent } from '@/lib/advances/fields';
import type { DepartmentRecord } from '@/lib/departments/department';
import type { Logo } from '@/lib/branding/logo';
import { brandingKey, getBranding } from '@/lib/branding/branding-service';
import { resolveShowLogo, type FestivalRecord } from '@/lib/festivals/festival';
import { festivalsKey, listFestivals } from '@/lib/festivals/festivals-service';
import { LogoRow } from '@/components/branding/LogoRow';
import { listDepartments } from '@/lib/departments/departments-service';
import {
  deleteAdvance,
  getAdvance,
  updateAdvance,
  updateSectionContent,
  updateSectionStatus,
} from './advances-service';
import { useResolvedEvent } from './useResolvedEvent';
import { AdvanceForm } from './AdvanceForm';
import { AdvanceSection } from './AdvanceSection';
import { AdvanceCallPanel } from './AdvanceCallPanel';
import { QuotesPanel } from './QuotesPanel';
import { DriveFilesPanel } from './DriveFilesPanel';
import { AdvanceDocumentsPanel } from './AdvanceDocumentsPanel';

const logger = createLogger('Advances');

/** Derived event/branding values for the screen, hoisted out of the component so their
 *  optional-chaining branches don't count against its complexity. */
function advanceDetailDerived(
  event: EventRecord | null | undefined,
  branding: { defaultLogos: Logo[] } | undefined,
  festivals: readonly FestivalRecord[],
) {
  return {
    timeZone: event?.timeZone ?? APP_TIME_ZONE,
    enabledIds: new Set(event?.departmentIds ?? []),
    parentEventLogo: resolveShowLogo(
      event?.eventLogo ?? null,
      event?.festivalId ?? null,
      festivals,
    ),
    defaultLogos: branding?.defaultLogos ?? [],
  };
}

export function AdvanceDetailScreen() {
  const { eventId: eventParam, stageId, advanceId } = useParams();
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Resolve slug-or-id → canonical event; the advance path + all sub-queries key on the id.
  const { query: eventQuery, eventId } = useResolvedEvent(eventParam);

  const advanceQuery = useQuery({
    queryKey: ['advances', eventId, stageId, advanceId],
    queryFn: () => getAdvance(eventId!, stageId!, advanceId!),
    enabled: !!eventId && !!stageId && !!advanceId,
  });

  const memberQuery = useQuery({
    queryKey: ['events', 'member', eventId, viewer?.uid],
    queryFn: () => getEventMember(viewer!.uid, eventId!),
    enabled: !!eventId && !!viewer,
  });

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const brandingQuery = useQuery({ queryKey: brandingKey(), queryFn: getBranding });
  const festivalsQuery = useQuery({ queryKey: festivalsKey(), queryFn: listFestivals });

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
      navigate(`/events/${eventParam}/stages/${stageId}`);
    },
    onError: (err) => logger.error('Failed to delete advance', err),
  });

  const setStatus = useMutation({
    mutationFn: ({ key, status }: { key: SectionKey; status: SectionStatus }) =>
      updateSectionStatus(eventId!, stageId!, advanceId!, key, status, viewer!.uid),
    onSuccess: () => invalidate(),
    onError: (err) => logger.error('Failed to update section status', err),
  });

  const saveContent = useMutation({
    mutationFn: ({
      deptId,
      content,
      bump,
    }: {
      deptId: string;
      content: SectionContent;
      bump: boolean;
    }) => updateSectionContent(eventId!, stageId!, advanceId!, deptId, content, bump),
    onSuccess: () => invalidate(),
    onError: (err) => logger.error('Failed to save section content', err),
  });

  if (!viewer || !eventId || !stageId || !advanceId) return null;

  const member = memberQuery.data ?? null;
  const canEdit = canEditEvent(viewer, member?.role ?? null);
  const advance = advanceQuery.data;

  // One section per enabled department (ordered), status from the advance.
  const departments = departmentsQuery.data ?? [];
  const { timeZone, enabledIds, parentEventLogo, defaultLogos } = advanceDetailDerived(
    eventQuery.data,
    brandingQuery.data,
    festivalsQuery.data ?? [],
  );
  const sectionRows = departments.filter((d) => enabledIds.has(d.id));

  return (
    <section className="space-y-6">
      <Link
        to={`/events/${eventParam}/stages/${stageId}`}
        className="text-sm text-ink-muted hover:text-accent"
      >
        ← Stage
      </Link>

      <AdvanceLoadStatus
        isLoading={advanceQuery.isLoading}
        isError={advanceQuery.isError}
        notFound={advanceQuery.data === null}
      />

      {advance && !editing && (
        <AdvanceHeader
          advance={advance}
          timeZone={timeZone}
          canEdit={canEdit}
          eventLogo={parentEventLogo}
          defaultLogos={defaultLogos}
          deletePending={remove.isPending}
          confirmDelete={confirmDelete}
          onEdit={() => setEditing(true)}
          onDelete={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
        />
      )}

      {advance && editing && (
        <AdvanceEditPanel
          advance={advance}
          event={eventQuery.data}
          pending={update.isPending}
          error={update.isError ? 'Could not save changes.' : null}
          onSubmit={(input) => update.mutate(input)}
          onCancel={() => setEditing(false)}
        />
      )}

      {advance && (
        <AdvanceSectionsPanel
          advance={advance}
          sectionRows={sectionRows}
          viewer={viewer}
          member={member}
          statusPending={setStatus.isPending}
          contentPending={saveContent.isPending}
          onSetStatus={(deptId, status) => setStatus.mutate({ key: deptId, status })}
          onSaveContent={(deptId, content, bump) => saveContent.mutate({ deptId, content, bump })}
        />
      )}

      {advance && (
        <>
          <AdvanceDocumentsPanel
            eventId={eventId}
            stageId={stageId}
            advanceId={advanceId}
            artistName={advance.artistName}
            canEdit={canEdit}
          />
          <DriveFilesPanel
            eventId={eventId}
            stageId={stageId}
            advanceId={advanceId}
            canEdit={canEdit}
          />
          <QuotesPanel
            eventId={eventId}
            stageId={stageId}
            advanceId={advanceId}
            uid={viewer.uid}
            canEdit={canEdit}
          />
        </>
      )}
    </section>
  );
}

function AdvanceLoadStatus({
  isLoading,
  isError,
  notFound,
}: {
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
}) {
  return (
    <>
      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {isError && <p className="text-sm text-accent">Failed to load this advance.</p>}
      {notFound && (
        <p className="text-sm text-ink-muted">
          Artist advance not found, or you don’t have access.
        </p>
      )}
    </>
  );
}

function AdvanceHeader({
  advance,
  canEdit,
  eventLogo,
  defaultLogos,
  deletePending,
  confirmDelete,
  onEdit,
  onDelete,
  timeZone,
}: {
  advance: Advance;
  timeZone: string;
  canEdit: boolean;
  eventLogo: Logo | null;
  defaultLogos: Logo[];
  deletePending: boolean;
  confirmDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <header className="space-y-2">
      <LogoRow eventLogo={eventLogo} defaults={defaultLogos} size="sm" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black tracking-tight text-brand">
          {advance.artistName}
        </h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={deletePending}
              onClick={onDelete}
              className="rounded border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          </div>
        )}
      </div>
      <p className="text-ink-muted">
        {advance.slot && <span className="mr-3">{slotLabel(advance.slot)}</span>}
        {advance.performanceDate && (
          <span>{formatZonedDate(advance.performanceDate, timeZone)}</span>
        )}
      </p>
      {advance.notes && <p className="whitespace-pre-line text-sm text-ink">{advance.notes}</p>}
      <div className="space-y-1 pt-1">
        <SummaryField label="Additions" value={advance.additions} />
        <SummaryField label="Concerns" value={advance.concerns} />
        <SummaryField label="Pending" value={advance.pending} />
      </div>
      <AdvanceCallPanel
        artistName={advance.artistName}
        at={advance.advanceCallAt}
        link={advance.advanceCallLink}
        viaGoogle={advance.googleCalendarEventId !== null}
        timeZone={timeZone}
        canEdit={canEdit}
      />
    </header>
  );
}

function AdvanceEditPanel({
  advance,
  event,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  advance: Advance;
  event: EventRecord | null | undefined;
  pending: boolean;
  error: string | null;
  onSubmit: (input: AdvanceInput) => void;
  onCancel: () => void;
}) {
  const timeZone = event?.timeZone ?? APP_TIME_ZONE;
  const days = eventDays(event?.startDate, event?.endDate, timeZone);
  return (
    <div className="rounded-lg border border-line bg-surface-muted/40 p-4">
      <h2 className="mb-3 font-display text-lg font-bold text-brand">Edit artist advance</h2>
      <AdvanceForm
        initial={advance}
        days={days}
        timeZone={timeZone}
        submitLabel="Save changes"
        pending={pending}
        error={error}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </div>
  );
}

function AdvanceSectionsPanel({
  advance,
  sectionRows,
  viewer,
  member,
  statusPending,
  contentPending,
  onSetStatus,
  onSaveContent,
}: {
  advance: Advance;
  sectionRows: DepartmentRecord[];
  viewer: Viewer;
  member: EventMember | null;
  statusPending: boolean;
  contentPending: boolean;
  onSetStatus: (deptId: SectionKey, status: SectionStatus) => void;
  onSaveContent: (deptId: string, content: SectionContent, bump: boolean) => void;
}) {
  return (
    <div className="space-y-1 border-t border-line pt-6">
      <h2 className="mb-2 font-display text-xl font-bold text-brand">Sections</h2>
      {sectionRows.length === 0 && (
        <p className="text-sm text-ink-muted">No departments enabled for this event.</p>
      )}
      {sectionRows.map((dept) => (
        <AdvanceSection
          key={dept.id}
          deptId={dept.id}
          deptName={dept.name}
          state={sectionStateFor(advance.sections, dept.id)}
          content={advance.content[dept.id] ?? {}}
          canEdit={canEditDepartment(viewer, member, dept.id)}
          canFinalize={canFinalizeSection(viewer, member, dept.id)}
          canUnlock={canUnlockSection(viewer, member, dept.id)}
          statusPending={statusPending}
          contentPending={contentPending}
          onSetStatus={onSetStatus}
          onSaveContent={onSaveContent}
        />
      ))}
    </div>
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
