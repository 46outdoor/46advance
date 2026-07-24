/**
 * Event documents (Documents PR 4, planning/DOCUMENTS_FEATURE.md decision 5): files in
 * the event's linked Drive folder, recorded per event and grouped by the schedule's day
 * keys — matching schedule days lend their color-coded headers; docs with no day sit in
 * an "Event-wide" group last. PM/admin upload (client-direct into the linked folder via
 * a short-lived drive.file token) and re-day/categorize/remove; every member views and
 * opens files in-app through the docs-broker.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { useBeforeUnload } from '@/lib/hooks/useBeforeUnload';
import { FilePickerButton } from '@/components/FilePickerButton';
import { canEditEvent } from '@/lib/rbac/permissions';
import { getEventRole } from '@/lib/rbac/membership';
import { formatDateKey } from '@/lib/dates/formatting';
import { scheduleDayTypeDef } from '@/lib/schedules/dayTypes';
import type { ScheduleDay } from '@/lib/schedules/scheduleDay';
import {
  groupEventDocumentsByDay,
  type EventDocument,
  type EventDocumentInput,
} from '@/lib/documents/eventDocument';
import { listDocumentCategories } from '@/lib/documents/document-categories-service';
import type { DocumentCategory } from '@/lib/documents/documentCategory';
import {
  deleteDriveUpload,
  openArtistDocument,
  uploadFileToDrive,
} from '@/lib/google/drive-service';
import { listScheduleDays } from './schedule-days-service';
import {
  createEventDocument,
  deleteEventDocument,
  listEventDocuments,
  updateEventDocument,
} from './event-documents-service';
import { useResolvedEvent } from './useResolvedEvent';

const logger = createLogger('EventDocuments');

const selectClass =
  'min-h-11 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand sm:min-h-0';

interface DayOption {
  key: string;
  label: string;
}

/** Upload control: file + day + category, into the event's linked folder. */
function UploadForm({
  dayOptions,
  categories,
  pending,
  onUpload,
}: {
  dayOptions: readonly DayOption[];
  categories: readonly DocumentCategory[];
  pending: boolean;
  onUpload: (file: File, input: EventDocumentInput) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [day, setDay] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inputKey, setInputKey] = useState(0);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
      <div className="text-sm">
        <span className="mb-1 block font-semibold text-ink">Upload a document</span>
        <FilePickerButton
          key={inputKey}
          label="Choose file"
          ariaLabel="File to upload"
          onFile={(f) => setFile(f)}
        />
      </div>
      <select
        className={selectClass}
        value={day}
        aria-label="Day"
        onChange={(e) => setDay(e.target.value)}
      >
        <option value="">Event-wide</option>
        {dayOptions.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={categoryId}
        aria-label="Category"
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!file || pending}
        className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        onClick={() => {
          if (!file) return;
          onUpload(file, { day: day || null, categoryId: categoryId || null });
          setFile(null);
          setInputKey((k) => k + 1);
        }}
      >
        {pending ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}

/** One document row: title, category badge, open; editors re-day/categorize + remove. */
function DocumentRow({
  doc,
  eventId,
  canEdit,
  pending,
  dayOptions,
  categories,
  onChange,
  onDelete,
}: {
  doc: EventDocument;
  eventId: string;
  canEdit: boolean;
  /** Locks the row's controls while an edit (and its refetch) is in flight. */
  pending: boolean;
  dayOptions: readonly DayOption[];
  categories: readonly DocumentCategory[];
  onChange: (input: EventDocumentInput) => void;
  onDelete: () => void;
}) {
  const categoryName = categories.find((c) => c.id === doc.categoryId)?.name ?? null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="font-semibold text-ink">{doc.displayName ?? doc.name}</span>
      {categoryName && !canEdit && (
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">
          {categoryName}
        </span>
      )}
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-muted hover:text-accent sm:min-h-0"
        onClick={() =>
          void openArtistDocument(doc.fileId, eventId).catch((e) =>
            logger.error('Failed to open document', e),
          )
        }
      >
        Open
      </button>
      {canEdit && (
        <>
          <select
            className={selectClass}
            value={doc.day ?? ''}
            disabled={pending}
            aria-label="Move to day"
            onChange={(e) => onChange({ day: e.target.value || null })}
          >
            <option value="">Event-wide</option>
            {dayOptions.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={doc.categoryId ?? ''}
            disabled={pending}
            aria-label="Category"
            onChange={(e) => onChange({ categoryId: e.target.value || null })}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent disabled:opacity-50 sm:min-h-0"
            onClick={onDelete}
          >
            Remove
          </button>
        </>
      )}
    </li>
  );
}

/** A day group's header — the matching schedule day lends its color + title. */
function DayGroupHeader({
  day,
  scheduleDay,
}: {
  day: string | null;
  scheduleDay: ScheduleDay | undefined;
}) {
  if (day === null) {
    return (
      <h2 className="rounded px-3 py-1.5 font-display text-lg font-bold text-brand">Event-wide</h2>
    );
  }
  if (!scheduleDay) {
    return (
      <h2 className="rounded px-3 py-1.5 font-display text-lg font-bold text-brand">
        {formatDateKey(day)}
      </h2>
    );
  }
  const dayType = scheduleDayTypeDef(scheduleDay.dayType);
  return (
    <h2
      className="flex flex-wrap items-baseline justify-between gap-x-4 rounded px-3 py-1.5 text-white"
      style={{ backgroundColor: dayType.color }}
    >
      <span className="font-bold">
        {dayType.label}
        {scheduleDay.title ? ` — ${scheduleDay.title}` : ''}
      </span>
      <span className="text-sm opacity-90">{formatDateKey(day)}</span>
    </h2>
  );
}

export function EventDocumentsScreen() {
  const { eventId: eventParam } = useParams();
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();
  const { query: eventQuery, eventId } = useResolvedEvent(eventParam);

  const roleQuery = useQuery({
    queryKey: ['events', 'role', eventId, user?.uid],
    queryFn: () => getEventRole(user!.uid, eventId!),
    enabled: !!eventId && !!user,
  });
  const documentsQuery = useQuery({
    queryKey: ['eventDocuments', eventId],
    queryFn: () => listEventDocuments(eventId!),
    enabled: !!eventId,
  });
  const daysQuery = useQuery({
    queryKey: ['scheduleDays', eventId],
    queryFn: () => listScheduleDays(eventId!),
    enabled: !!eventId,
  });
  const categoriesQuery = useQuery({
    queryKey: ['documentCategories'],
    queryFn: listDocumentCategories,
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['eventDocuments', eventId] });

  const upload = useMutation({
    mutationFn: async ({ file, input }: { file: File; input: EventDocumentInput }) => {
      const uploaded = await uploadFileToDrive(file, eventQuery.data!.driveFolderId!);
      try {
        await createEventDocument(eventId!, uploaded, input);
      } catch (e) {
        // Don't strand an unrecorded file in the folder — remove it and surface the error. Log a
        // cleanup failure rather than swallow it, so an orphan is observable (event folders aren't
        // swept by any cron, unlike the artist library).
        await deleteDriveUpload(uploaded.fileId).catch((cleanupErr) =>
          logger.error(
            'Failed to remove an orphaned Drive upload after a failed record write',
            cleanupErr,
          ),
        );
        throw e;
      }
    },
    onSuccess: invalidate,
    onError: (e) => logger.error('Failed to upload the document', e),
  });
  // Discourage a hard tab-close mid-upload, which would abandon the record write and orphan the file.
  useBeforeUnload(upload.isPending);
  const edit = useMutation({
    mutationFn: ({ docId, input }: { docId: string; input: EventDocumentInput }) =>
      updateEventDocument(eventId!, docId, input),
    // Returning the invalidate promise keeps isPending true through the refetch, so the
    // row controls stay locked until they re-render with fresh values (no lost edits).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eventDocuments', eventId] }),
    onError: (e) => logger.error('Failed to update the document', e),
  });
  const remove = useMutation({
    mutationFn: (docId: string) => deleteEventDocument(eventId!, docId),
    onSuccess: invalidate,
    onError: (e) => logger.error('Failed to remove the document', e),
  });

  if (!user || !eventParam) return null;
  const canEdit = canEditEvent({ uid: user.uid, isAdmin, isOrganizer }, roleQuery.data ?? null);
  const event = eventQuery.data;
  const scheduleDays = daysQuery.data ?? [];
  const dayByKey = new Map(scheduleDays.map((d) => [d.id, d]));
  const dayOptions: DayOption[] = scheduleDays.map((d) => ({
    key: d.id,
    label: formatDateKey(d.date),
  }));
  const categories = categoriesQuery.data ?? [];
  const groups = groupEventDocumentsByDay(documentsQuery.data ?? []);

  return (
    <section className="space-y-5">
      <Link to={`/events/${eventParam}`} className="text-sm text-ink-muted hover:text-accent">
        ← Event
      </Link>
      <h1 className="font-display text-3xl font-black tracking-tight text-brand">
        Documents{event ? ` — ${event.name}` : ''}
      </h1>

      {documentsQuery.isLoading && <p className="text-sm text-ink-muted">Loading documents…</p>}
      {documentsQuery.isError && <p className="text-sm text-accent">Failed to load documents.</p>}
      {(upload.isError || edit.isError || remove.isError) && (
        <p className="text-sm text-accent">Could not save — check your connection and try again.</p>
      )}

      {canEdit &&
        (event?.driveFolderId ? (
          <UploadForm
            dayOptions={dayOptions}
            categories={categories}
            pending={upload.isPending}
            onUpload={(file, input) => upload.mutate({ file, input })}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Link a Drive folder on the event (Edit → Event documents folder) to enable uploads.
          </p>
        ))}

      {documentsQuery.data && groups.length === 0 && (
        <p className="text-sm text-ink-muted">No event documents yet.</p>
      )}

      {groups.map((group) => (
        <div
          key={group.day ?? 'event-wide'}
          className="overflow-hidden rounded-lg border border-line"
        >
          <DayGroupHeader
            day={group.day}
            scheduleDay={group.day ? dayByKey.get(group.day) : undefined}
          />
          <ul className="divide-y divide-line/60 px-3">
            {group.documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                eventId={eventId!}
                canEdit={canEdit}
                pending={edit.isPending || remove.isPending}
                dayOptions={dayOptions}
                categories={categories}
                onChange={(input) => edit.mutate({ docId: doc.id, input })}
                onDelete={() => remove.mutate(doc.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
