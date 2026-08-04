/**
 * "Import from schedule template" panel on the event schedule (edit mode). Applies a
 * standard or master template: offsets resolve against the event's start date in its
 * timezone, masters compose their referenced templates first, and resolved days merge
 * into existing date cards (decision 22). Importing runs a duplicate pre-flight first:
 * items the schedule already has (same day + type/time/name/stage) surface an inline
 * add / skip / replace choice instead of silently doubling rows. Self-contained: owns
 * its template query and apply mutation, invalidating the day list on success.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  resolveTemplateDays,
  scheduleTemplateCategoryLabel,
  templateItemCount,
  type ScheduleTemplateDay,
} from '@/lib/schedules/scheduleTemplate';
import { listScheduleTemplates } from '@/lib/schedules/schedule-templates-service';
import type { StageOption } from '@/components/schedules/ScheduleItemRowEditor';
import {
  applyTemplateDaysToEvent,
  previewTemplateImport,
  reconcileScheduleDayCalendar,
  type TemplateImportMode,
} from './schedule-days-service';

const logger = createLogger('Schedule');

const choiceButtonClass =
  'inline-flex min-h-11 items-center rounded border border-line px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0';

function importSummary({
  added,
  replaced,
  skipped,
}: {
  added: number;
  replaced: number;
  skipped: number;
}): string {
  const parts = [`${added} added`];
  if (replaced > 0) parts.push(`${replaced} replaced`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return `Imported — ${parts.join(', ')}.`;
}

export function ImportScheduleTemplatePanel({
  eventId,
  eventStart,
  timeZone,
  stages,
  uid,
}: {
  eventId: string;
  eventStart: Date | null;
  timeZone: string;
  stages: readonly StageOption[];
  uid: string;
}) {
  const queryClient = useQueryClient();
  const [importId, setImportId] = useState('');
  /** Set when the pre-flight found overlap — the user picks how the import lands.
   * Carries the resolved-days snapshot the counts were computed for: the apply must
   * use exactly that, never re-resolve a selection that may have changed since. */
  const [pendingDuplicates, setPendingDuplicates] = useState<{
    total: number;
    duplicates: number;
    days: ScheduleTemplateDay[];
  } | null>(null);
  const templatesQuery = useQuery({
    queryKey: ['scheduleTemplates'],
    queryFn: listScheduleTemplates,
  });
  const templates = templatesQuery.data ?? [];

  const resolveSelected = (): ScheduleTemplateDay[] => {
    const template = templates.find((t) => t.id === importId);
    if (!template) throw new Error('No template selected.');
    const byId = new Map(templates.map((t) => [t.id, t]));
    return resolveTemplateDays(template, byId);
  };

  const importTemplate = useMutation({
    mutationFn: ({ days, mode }: { days: ScheduleTemplateDay[]; mode: TemplateImportMode }) =>
      applyTemplateDaysToEvent(eventId, days, eventStart, timeZone, stages, uid, mode),
    onSuccess: ({ dates }) => {
      void queryClient.invalidateQueries({ queryKey: ['scheduleDays', eventId] });
      setImportId('');
      setPendingDuplicates(null);
      // Fire-and-forget: push the imported days to the event's calendar (no-op if the
      // caller hasn't connected Google).
      for (const date of dates) {
        void reconcileScheduleDayCalendar(eventId, date)
          .then(() => queryClient.invalidateQueries({ queryKey: ['scheduleDays', eventId] }))
          .catch((e) => logger.error('Calendar sync failed', e));
      }
    },
    onError: (e) => logger.error('Failed to import schedule template', e),
  });

  // Pre-flight: import straight away when the schedule has none of the template's items;
  // otherwise surface the add / skip / replace choice. The resolved days travel with the
  // mutation so a selection change mid-flight can't swap the template under the verdict.
  const checkDuplicates = useMutation({
    mutationFn: (days: ScheduleTemplateDay[]) =>
      previewTemplateImport(eventId, days, eventStart, timeZone, stages),
    onSuccess: (preview, days) => {
      if (preview.duplicates === 0) importTemplate.mutate({ days, mode: 'add' });
      else setPendingDuplicates({ ...preview, days });
    },
    onError: (e) => logger.error('Failed to check the template against the schedule', e),
  });

  const busy = checkDuplicates.isPending || importTemplate.isPending;
  const visibleError = checkDuplicates.isError ? checkDuplicates.error : importTemplate.error;

  if (templates.length === 0) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Import from schedule template</span>
        <select
          className="min-h-11 rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand sm:min-h-0"
          value={importId}
          disabled={busy}
          onChange={(e) => {
            setImportId(e.target.value);
            setPendingDuplicates(null);
          }}
        >
          <option value="">Select a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ·{' '}
              {t.kind === 'master'
                ? `Master (${t.refs.length} composed)`
                : `${scheduleTemplateCategoryLabel(t.category)} · ${templateItemCount(t)} items`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!importId || !eventStart || busy || pendingDuplicates !== null}
        onClick={() => checkDuplicates.mutate(resolveSelected())}
        className="inline-flex min-h-11 items-center rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
      >
        {busy ? 'Importing…' : 'Import'}
      </button>
      {!eventStart && (
        <span className="text-sm text-ink-muted">
          Set the event’s start date first — template days anchor to it.
        </span>
      )}
      {importTemplate.isSuccess && importTemplate.data && (
        <span className="text-sm text-status-complete">{importSummary(importTemplate.data)}</span>
      )}
      {(importTemplate.isError || checkDuplicates.isError) && (
        <span className="text-sm text-accent">
          {visibleError instanceof Error ? visibleError.message : 'Could not import.'}
        </span>
      )}
      {pendingDuplicates && (
        <div className="w-full space-y-2 rounded border border-line bg-surface-muted/40 p-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">
              {pendingDuplicates.duplicates} of this template’s {pendingDuplicates.total} items
            </span>{' '}
            are already on the schedule (same day, type, time, name, and stage).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => importTemplate.mutate({ days: pendingDuplicates.days, mode: 'skip' })}
              className="inline-flex min-h-11 items-center rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
            >
              Add new items only
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                importTemplate.mutate({ days: pendingDuplicates.days, mode: 'replace' })
              }
              className={choiceButtonClass}
            >
              Replace duplicates + add new
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => importTemplate.mutate({ days: pendingDuplicates.days, mode: 'add' })}
              className={choiceButtonClass}
            >
              Add everything anyway
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPendingDuplicates(null)}
              className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink sm:min-h-0"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Replacing updates the matching rows’ description, details, and crew to the template’s
            version — their calendar events are kept and updated in place.
          </p>
        </div>
      )}
    </div>
  );
}
