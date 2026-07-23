/**
 * "Import from schedule template" panel on the event schedule (edit mode). Applies a
 * standard or master template: offsets resolve against the event's start date in its
 * timezone, masters compose their referenced templates first, and resolved days merge
 * into existing date cards (decision 22). Self-contained: owns its template query and
 * apply mutation, invalidating the day list on success.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  resolveTemplateDays,
  scheduleTemplateCategoryLabel,
  templateItemCount,
} from '@/lib/schedules/scheduleTemplate';
import { listScheduleTemplates } from '@/lib/schedules/schedule-templates-service';
import type { StageOption } from '@/components/schedules/ScheduleItemRowEditor';
import { applyTemplateDaysToEvent, reconcileScheduleDayCalendar } from './schedule-days-service';

const logger = createLogger('Schedule');

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
  const templatesQuery = useQuery({
    queryKey: ['scheduleTemplates'],
    queryFn: listScheduleTemplates,
  });
  const templates = templatesQuery.data ?? [];

  const importTemplate = useMutation({
    mutationFn: () => {
      const template = templates.find((t) => t.id === importId);
      if (!template) throw new Error('No template selected.');
      const byId = new Map(templates.map((t) => [t.id, t]));
      const resolved = resolveTemplateDays(template, byId);
      return applyTemplateDaysToEvent(eventId, resolved, eventStart, timeZone, stages, uid);
    },
    onSuccess: ({ dates }) => {
      void queryClient.invalidateQueries({ queryKey: ['scheduleDays', eventId] });
      setImportId('');
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

  if (templates.length === 0) return null;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Import from schedule template</span>
        <select
          className="min-h-11 rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand sm:min-h-0"
          value={importId}
          onChange={(e) => setImportId(e.target.value)}
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
        disabled={!importId || !eventStart || importTemplate.isPending}
        onClick={() => importTemplate.mutate()}
        className="inline-flex min-h-11 items-center rounded border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
      >
        {importTemplate.isPending ? 'Importing…' : 'Import'}
      </button>
      {!eventStart && (
        <span className="text-sm text-ink-muted">
          Set the event’s start date first — template days anchor to it.
        </span>
      )}
      {importTemplate.isSuccess && <span className="text-sm text-status-complete">Imported.</span>}
      {importTemplate.isError && (
        <span className="text-sm text-accent">
          {importTemplate.error instanceof Error
            ? importTemplate.error.message
            : 'Could not import.'}
        </span>
      )}
    </div>
  );
}
