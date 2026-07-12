/**
 * Schedule-template editor, spreadsheet-style: add + label operational days first (e.g.
 * "Load-in 3 — Stage Build Day 1 + Pre Rig"), then add blueprint items within each day.
 * Days and items live in local state; "Save template" persists the whole template at once.
 * Importing a template into an event happens from the event's schedule screen.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import { slotLabel } from '@/lib/advances/advance';
import { formatWallClockTime } from '@/lib/dates/formatting';
import { scheduleSectionDef, scheduleSectionLabel } from '@/lib/schedules/sections';
import {
  SCHEDULE_TEMPLATE_CATEGORIES,
  categoryDefaultSection,
  scheduleTemplateCategoryLabel,
  templateDayLabel,
  wallClockHours,
  type ScheduleTemplate,
  type ScheduleTemplateCategory,
  type ScheduleTemplateDay,
  type ScheduleTemplateItem,
} from '@/lib/schedules/scheduleTemplate';
import { getScheduleTemplate, updateScheduleTemplate } from '@/lib/schedules/schedule-templates-service';
import { listTemplates } from '@/lib/templates/templates-service';
import { ScheduleTemplateItemForm, type ScheduleTemplateItemDraft } from './ScheduleTemplateItemForm';

const logger = createLogger('ScheduleTemplates');
const inputClass = 'rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';
const chipButton = 'rounded border border-line px-2 py-1 text-xs text-ink-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';

/** The row's time-range column ("8:00 AM–6:00 PM (est)"); em dash without a start time. */
function itemTimes(item: ScheduleTemplateItem): string {
  if (!item.timeOfDay) return '—';
  const start = formatWallClockTime(item.timeOfDay);
  if (!item.endTimeOfDay) return start;
  return `${start}–${formatWallClockTime(item.endTimeOfDay)}${item.endEstimated ? ' (est)' : ''}`;
}

/** The row's trailing detail column: duration (when computable), section (only when it
 * differs from the template category's default), stage, slot, location, and remaining
 * section fields — quantity is excluded since it has its own column. */
function itemDetail(item: ScheduleTemplateItem, category: ScheduleTemplateCategory): string {
  const parts: string[] = [];
  const hours = wallClockHours(item.timeOfDay, item.endTimeOfDay);
  if (hours != null) parts.push(`${hours} hrs`);
  if (item.section !== categoryDefaultSection(category)) {
    parts.push(scheduleSectionLabel(item.section, item.customLabel));
  }
  if (item.stageName) parts.push(item.stageName);
  if (item.slot != null) parts.push(slotLabel(item.slot));
  if (item.location) parts.push(item.location);
  for (const f of scheduleSectionDef(item.section).fields) {
    if (f.key === 'crewCount') continue; // own column
    if (item.fields[f.key]) parts.push(`${f.label}: ${item.fields[f.key]}`);
  }
  return parts.join(' · ');
}

interface DayGroup {
  offset: number;
  /** The day's label; null for an implicit group (items on an offset with no labeled day). */
  label: string | null;
  rows: ScheduleTemplateItem[];
}

/** The labeled days (sorted) define the groups; items attach by `dayOffset` and sort by
 * start time within the day (untimed items last) — there is no manual reordering, so the
 * display always matches the times. Items on an offset without a labeled day (older
 * templates) get an implicit unlabeled group. */
function groupItems(days: ScheduleTemplateDay[], items: ScheduleTemplateItem[]): DayGroup[] {
  const byOffset = new Map<number, DayGroup>();
  for (const d of days) byOffset.set(d.offset, { offset: d.offset, label: d.label, rows: [] });
  for (const item of items) {
    let group = byOffset.get(item.dayOffset);
    if (!group) {
      group = { offset: item.dayOffset, label: null, rows: [] };
      byOffset.set(item.dayOffset, group);
    }
    group.rows.push(item);
  }
  for (const group of byOffset.values()) {
    group.rows.sort(
      (a, b) => (a.timeOfDay ?? '~').localeCompare(b.timeOfDay ?? '~') || a.order - b.order,
    );
  }
  return [...byOffset.values()].sort((a, b) => a.offset - b.offset);
}

/** Offsets offered when adding/editing a day: Load-in 3 → Show day 7, minus taken ones
 * (keeping `current` so an edit can leave the offset unchanged). */
function dayOffsetOptions(used: number[], current?: number): number[] {
  const taken = new Set(used);
  const options: number[] = [];
  for (let o = -3; o <= 6; o += 1) {
    if (!taken.has(o) || o === current) options.push(o);
  }
  return options;
}

/** Add/edit a labeled day: which relative day it is + its operational label. */
function DayForm({
  initial,
  usedOffsets,
  onSubmit,
  onCancel,
}: {
  initial?: ScheduleTemplateDay;
  usedOffsets: number[];
  onSubmit: (day: ScheduleTemplateDay) => void;
  onCancel: () => void;
}) {
  const options = dayOffsetOptions(usedOffsets, initial?.offset);
  const [offset, setOffset] = useState(initial?.offset ?? options[0] ?? 0);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [error, setError] = useState(false);
  const submit = () => {
    if (!label.trim()) {
      setError(true);
      return;
    }
    onSubmit({ offset, label: label.trim() });
  };
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-muted/40 p-3">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Day</span>
        <select className={inputClass} value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o} value={o}>
              {templateDayLabel(o)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Label</span>
        <input
          className={`${inputClass} w-72`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Stage Build Day 1 + Pre Rig"
        />
      </label>
      <button
        type="button"
        onClick={submit}
        className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {initial ? 'Save day' : 'Add day'}
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">
        Cancel
      </button>
      {error && <span className="text-sm text-accent">Label is required.</span>}
    </div>
  );
}

/** One schedule row, spreadsheet-style: times | quantity | title | detail | controls.
 * The fixed column widths are shared by every row (and every day card), so the columns
 * line up vertically; small screens fall back to a wrapped line. */
function ItemRow({
  item,
  category,
  onEdit,
  onRemove,
}: {
  item: ScheduleTemplateItem;
  category: ScheduleTemplateCategory;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const qty = item.fields.crewCount;
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-sm sm:grid sm:grid-cols-[10.5rem_4rem_11rem_minmax(0,1fr)_auto]">
      <span className="text-ink-muted">{itemTimes(item)}</span>
      <span className="text-ink-muted">{qty ? `Qty ${qty}` : ''}</span>
      <span className="font-semibold text-ink">{item.title}</span>
      <span className="text-ink-muted">{itemDetail(item, category)}</span>
      <div className="flex shrink-0 items-center justify-end gap-2 text-xs">
        <button type="button" onClick={onEdit} className={chipButton}>Edit</button>
        <button type="button" onClick={onRemove} className={chipButton}>Remove</button>
      </div>
    </li>
  );
}

function reindex(items: ScheduleTemplateItem[]): ScheduleTemplateItem[] {
  return items.map((it, i) => ({ ...it, order: i }));
}

function Editor({ template }: { template: ScheduleTemplate }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState<ScheduleTemplateCategory>(template.category);
  const [days, setDays] = useState<ScheduleTemplateDay[]>(template.days);
  const [items, setItems] = useState<ScheduleTemplateItem[]>(template.items);
  const [addingDay, setAddingDay] = useState(false);
  const [editingDayOffset, setEditingDayOffset] = useState<number | null>(null);
  const [addingItemDay, setAddingItemDay] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Stage dropdown options: the canonical stage names across the event templates.
  const templatesQuery = useQuery({ queryKey: ['templates'], queryFn: listTemplates });
  const stageNames = [
    ...new Set((templatesQuery.data ?? []).flatMap((t) => t.stages.map((s) => s.name.trim())).filter(Boolean)),
  ];

  const save = useMutation({
    mutationFn: () => updateScheduleTemplate(template.id, { name: name.trim(), category, days, items }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduleTemplate', template.id] });
      void queryClient.invalidateQueries({ queryKey: ['scheduleTemplates'] });
    },
    onError: (err) => logger.error('Failed to save schedule template', err),
  });

  const addItem = (draft: ScheduleTemplateItemDraft) => {
    setItems((p) => [...p, { ...draft, id: crypto.randomUUID(), order: p.length }]);
    setAddingItemDay(null);
  };
  const editItem = (id: string, draft: ScheduleTemplateItemDraft) => {
    setItems((p) => p.map((it) => (it.id === id ? { ...draft, id, order: it.order } : it)));
    setEditingId(null);
  };
  const removeItem = (id: string) => setItems((p) => reindex(p.filter((it) => it.id !== id)));

  /** Add a day, or (when `prevOffset` is set) rewrite one — an offset change carries the
   * day's items along so they stay grouped under it. */
  const upsertDay = (day: ScheduleTemplateDay, prevOffset?: number) => {
    setDays((p) =>
      p.filter((d) => d.offset !== (prevOffset ?? day.offset)).concat(day).sort((a, b) => a.offset - b.offset),
    );
    if (prevOffset !== undefined && prevOffset !== day.offset) {
      setItems((p) => p.map((it) => (it.dayOffset === prevOffset ? { ...it, dayOffset: day.offset } : it)));
    }
  };
  const removeDay = (offset: number) => setDays((p) => p.filter((d) => d.offset !== offset));

  const groups = groupItems(days, items);
  const usedOffsets = days.map((d) => d.offset);

  return (
    <section className="space-y-6">
      <div>
        <Link to="/schedule-templates" className="text-sm text-ink-muted hover:text-accent">
          ← Schedule templates
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Name</span>
          <input className={`${inputClass} w-64`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Category</span>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as ScheduleTemplateCategory)}>
            {SCHEDULE_TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {scheduleTemplateCategoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save template'}
        </button>
        {save.isSuccess && <span className="text-sm text-status-complete">Saved.</span>}
        {save.isError && <span className="text-sm text-accent">Could not save.</span>}
      </div>

      {groups.length === 0 && <p className="text-sm text-ink-muted">Add a day to get started.</p>}

      <div className="space-y-5">
        {groups.map((group) => {
          const day = days.find((d) => d.offset === group.offset);
          return (
            <div key={group.offset} className="space-y-2">
              {editingDayOffset === group.offset && day ? (
                <DayForm
                  initial={day}
                  usedOffsets={usedOffsets}
                  onSubmit={(d) => {
                    upsertDay(d, group.offset);
                    setEditingDayOffset(null);
                  }}
                  onCancel={() => setEditingDayOffset(null)}
                />
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-lg font-bold text-brand">
                    {templateDayLabel(group.offset)}
                    {group.label ? ` — ${group.label}` : ''}
                  </h2>
                  {day && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingDayOffset(group.offset)} className={chipButton}>
                        Edit day
                      </button>
                      <button
                        type="button"
                        disabled={group.rows.length > 0}
                        title={group.rows.length > 0 ? 'Remove its items first' : undefined}
                        onClick={() => removeDay(group.offset)}
                        className={chipButton}
                      >
                        Remove day
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-lg border border-line px-3 py-2">
                {group.rows.length > 0 && (
                  <ul className="divide-y divide-line/60">
                    {group.rows.map((it) =>
                      editingId === it.id ? (
                        <li key={it.id} className="py-2">
                          <ScheduleTemplateItemForm
                            initial={it}
                            stageNames={stageNames}
                            submitLabel="Save item"
                            onSubmit={(d) => editItem(it.id, d)}
                            onCancel={() => setEditingId(null)}
                          />
                        </li>
                      ) : (
                        <ItemRow
                          key={it.id}
                          item={it}
                          category={category}
                          onEdit={() => setEditingId(it.id)}
                          onRemove={() => removeItem(it.id)}
                        />
                      ),
                    )}
                  </ul>
                )}
                {addingItemDay === group.offset ? (
                  <div className="py-2">
                    <ScheduleTemplateItemForm
                      dayOffset={group.offset}
                      defaultSection={categoryDefaultSection(category)}
                      stageNames={stageNames}
                      submitLabel="Add item"
                      onSubmit={addItem}
                      onCancel={() => setAddingItemDay(null)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingItemDay(group.offset)}
                    className="py-1.5 text-sm text-ink-muted hover:text-ink"
                  >
                    + Add item
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {addingDay ? (
        <DayForm
          usedOffsets={usedOffsets}
          onSubmit={(d) => {
            upsertDay(d);
            setAddingDay(false);
          }}
          onCancel={() => setAddingDay(false)}
        />
      ) : (
        <button type="button" onClick={() => setAddingDay(true)} className="text-sm text-ink-muted hover:text-ink">
          + Add day
        </button>
      )}

      <p className="text-xs text-ink-muted">
        Days and items are saved with <strong>Save template</strong> — build them out, then save.
      </p>
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

  if (templateQuery.isLoading) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!templateQuery.data) return <p className="text-sm text-accent">Schedule template not found.</p>;
  return <Editor key={templateQuery.data.id} template={templateQuery.data} />;
}
