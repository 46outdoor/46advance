/**
 * Admin: edit one schedule template on the shared day-card grid (redesign PR 3). Days are
 * relative offsets ("Load-in 2") instead of dates; items edit inline exactly like the
 * event schedule, with the stage referenced by NAME (options come from the event
 * templates' stages). Masters additionally manage an ordered list of composed standard
 * templates and the single "default" flag (auto-applied on event creation). Edits stay
 * local until "Save changes" writes the whole doc.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  SCHEDULE_TEMPLATE_CATEGORIES,
  scheduleTemplateCategoryLabel,
  templateDayChipLabel,
  templateDaysToInput,
  templateItemToDayItem,
  dayItemToTemplateItem,
  type ScheduleTemplate,
  type ScheduleTemplateCategory,
  type ScheduleTemplateDay,
} from '@/lib/schedules/scheduleTemplate';
import { resolveArtistPlaceholders, type ScheduleDayItem } from '@/lib/schedules/scheduleDay';
import { crewTypesKey, getCrewTypes } from '@/lib/schedules/crew-types-service';
import {
  getScheduleTemplate,
  listScheduleTemplates,
  updateScheduleTemplate,
} from '@/lib/schedules/schedule-templates-service';
import { listTemplates } from '@/lib/templates/templates-service';
import { ScheduleDayCard } from '@/components/schedules/ScheduleDayCard';
import type { StageOption } from '@/components/schedules/ScheduleItemRowEditor';
import { TemplateDayForm, type TemplateDayMeta } from './TemplateDayForm';
import { MasterTemplateRefs } from './MasterTemplateRefs';

const logger = createLogger('ScheduleTemplates');

const inputClass =
  'min-h-11 rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand sm:min-h-0';

function blankItem(): ScheduleDayItem {
  return {
    id: crypto.randomUUID(),
    type: 'production',
    customLabel: null,
    startTime: null,
    endTime: null,
    endEstimated: false,
    item: 'New item',
    description: null,
    stageId: null,
    fields: {},
    crew: [],
    pushToCalendar: true,
    googleCalendarEventId: null,
  };
}

/** Placeholders can't resolve in a template (no event lineup) — show the slot label. */
const resolveNothing = (_item: ScheduleDayItem, text: string) => resolveArtistPlaceholders(text, () => null);

function Editor({ template, allTemplates }: { template: ScheduleTemplate; allTemplates: ScheduleTemplate[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState<ScheduleTemplateCategory>(template.category);
  const [refs, setRefs] = useState<string[]>(template.refs);
  const [isDefault, setIsDefault] = useState(template.isDefault);
  const [days, setDays] = useState<ScheduleTemplateDay[]>(template.days);
  const [addingDay, setAddingDay] = useState(false);
  const [editingOffset, setEditingOffset] = useState<number | null>(null);

  // Stage-name options: canonical names across the event templates (stage "id" = the name).
  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const stageNames: StageOption[] = [
    ...new Set((templatesQuery.data ?? []).flatMap((t) => t.stages.map((s) => s.name.trim())).filter(Boolean)),
  ].map((n) => ({ id: n, name: n }));
  const crewTypesQuery = useQuery({ queryKey: crewTypesKey(), queryFn: getCrewTypes });

  const save = useMutation({
    mutationFn: () =>
      updateScheduleTemplate(template.id, {
        name: name.trim(),
        kind: template.kind,
        category,
        refs,
        isDefault,
        days: templateDaysToInput(days),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduleTemplate', template.id] });
      void queryClient.invalidateQueries({ queryKey: ['scheduleTemplates'] });
    },
    onError: (err) => logger.error('Failed to save schedule template', err),
  });

  const upsertDayMeta = (meta: TemplateDayMeta, previousOffset?: number) => {
    setDays((prev) => {
      const rest = prev.filter((d) => d.offset !== (previousOffset ?? meta.offset));
      const existing = prev.find((d) => d.offset === (previousOffset ?? meta.offset));
      const next: ScheduleTemplateDay = {
        offset: meta.offset,
        dayType: meta.dayType,
        title: meta.title ?? null,
        description: meta.description ?? null,
        notes: meta.notes ?? null,
        items: existing?.items ?? [],
      };
      return [...rest, next].sort((a, b) => a.offset - b.offset);
    });
    setAddingDay(false);
    setEditingOffset(null);
  };

  const setDayItems = (offset: number, items: ScheduleDayItem[]) =>
    setDays((prev) =>
      prev.map((d) => (d.offset === offset ? { ...d, items: items.map(dayItemToTemplateItem) } : d)),
    );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Name</span>
          <input className={`${inputClass} w-80`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {template.kind === 'standard' ? (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink">Category</span>
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as ScheduleTemplateCategory)}
            >
              {SCHEDULE_TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {scheduleTemplateCategoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink sm:min-h-0">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Default master (auto-applied when creating an event)
          </label>
        )}
        <button
          type="button"
          disabled={save.isPending || !name.trim()}
          onClick={() => save.mutate()}
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        >
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>

      {template.kind === 'master' && (
        <MasterTemplateRefs
          refs={refs}
          onChange={setRefs}
          standardTemplates={allTemplates.filter((t) => t.kind === 'standard')}
        />
      )}

      {!addingDay ? (
        <button
          type="button"
          onClick={() => setAddingDay(true)}
          className="inline-flex min-h-11 items-center rounded border border-line px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent sm:min-h-0"
        >
          + Add day
        </button>
      ) : (
        <TemplateDayForm
          usedOffsets={days.map((d) => d.offset)}
          submitLabel="Add day"
          onSubmit={(meta) => upsertDayMeta(meta)}
          onCancel={() => setAddingDay(false)}
        />
      )}

      {days.map((day) =>
        editingOffset === day.offset ? (
          <TemplateDayForm
            key={day.offset}
            initial={day}
            usedOffsets={days.map((d) => d.offset)}
            submitLabel="Save day"
            onSubmit={(meta) => upsertDayMeta(meta, day.offset)}
            onCancel={() => setEditingOffset(null)}
          />
        ) : (
          <ScheduleDayCard
            key={day.offset}
            day={{
              id: String(day.offset),
              dayType: day.dayType,
              title: day.title,
              description: day.description,
              notes: day.notes,
            }}
            dateLabel={templateDayChipLabel(day, days)}
            items={day.items.map(templateItemToDayItem)}
            editing
            stages={stageNames}
            crewTypes={crewTypesQuery.data ?? []}
            resolveText={resolveNothing}
            onEditDay={() => setEditingOffset(day.offset)}
            onDeleteDay={() => setDays((prev) => prev.filter((d) => d.offset !== day.offset))}
            onAddItem={() =>
              setDayItems(day.offset, [...day.items.map(templateItemToDayItem), blankItem()])
            }
            onCommitItem={(item) =>
              setDayItems(
                day.offset,
                day.items.map(templateItemToDayItem).map((i) => (i.id === item.id ? item : i)),
              )
            }
            onDeleteItem={(itemId) =>
              setDayItems(
                day.offset,
                day.items.map(templateItemToDayItem).filter((i) => i.id !== itemId),
              )
            }
          />
        ),
      )}
      {days.length === 0 && !addingDay && (
        <p className="text-sm text-ink-muted">No days yet — add the first operational day.</p>
      )}
    </section>
  );
}

export function ScheduleTemplateEditorScreen() {
  const { id } = useParams();
  const templateQuery = useQuery({
    queryKey: ['scheduleTemplate', id],
    queryFn: () => getScheduleTemplate(id!),
    enabled: !!id,
  });
  const allQuery = useQuery({ queryKey: ['scheduleTemplates'], queryFn: listScheduleTemplates });

  return (
    <section className="space-y-5">
      <Link to="/schedule-templates" className="text-sm text-ink-muted hover:text-accent">
        ← Schedule templates
      </Link>
      <h1 className="font-display text-3xl font-black tracking-tight text-brand">
        {templateQuery.data ? templateQuery.data.name : 'Schedule template'}
      </h1>
      {templateQuery.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {templateQuery.isError && <p className="text-sm text-accent">Failed to load the template.</p>}
      {templateQuery.data === null && <p className="text-sm text-accent">Template not found.</p>}
      {/* A master's composition needs the full catalog — rendering it against an empty
          list would make every ref look missing and a save could wipe them. */}
      {templateQuery.data?.kind === 'master' && allQuery.isLoading && (
        <p className="text-sm text-ink-muted">Loading composed templates…</p>
      )}
      {templateQuery.data?.kind === 'master' && allQuery.isError && (
        <p className="text-sm text-accent">Failed to load composed templates.</p>
      )}
      {templateQuery.data && (templateQuery.data.kind !== 'master' || !!allQuery.data) && (
        <Editor
          key={templateQuery.data.id}
          template={templateQuery.data}
          allTemplates={allQuery.data ?? []}
        />
      )}
    </section>
  );
}
