/**
 * Add/edit a template day's metadata: relative day (offset), day type, title,
 * description, notes — the template-side sibling of the event ScheduleDayForm (offsets
 * instead of dates; items live in the grid).
 */
import { useState, type FormEvent } from 'react';
import { SCHEDULE_DAY_TYPES, type ScheduleDayType } from '@/lib/schedules/dayTypes';
import { templateDayLabel, type ScheduleTemplateDay } from '@/lib/schedules/scheduleTemplate';

export interface TemplateDayMeta {
  offset: number;
  dayType: ScheduleDayType;
  title?: string;
  description?: string;
  notes?: string;
}

const inputClass =
  'min-h-11 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand sm:min-h-0';

/** Offsets offered: Day -7 → Show day 10, minus taken ones (keeping `current` so an
 * edit can leave the offset unchanged). */
function offsetOptions(used: readonly number[], current?: number): number[] {
  const taken = new Set(used);
  const options: number[] = [];
  for (let o = -7; o <= 9; o += 1) {
    if (!taken.has(o) || o === current) options.push(o);
  }
  return options;
}

export function TemplateDayForm({
  initial,
  usedOffsets,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ScheduleTemplateDay;
  usedOffsets: readonly number[];
  submitLabel: string;
  onSubmit: (meta: TemplateDayMeta) => void;
  onCancel: () => void;
}) {
  const options = offsetOptions(usedOffsets, initial?.offset);
  const [offset, setOffset] = useState(initial?.offset ?? options[0] ?? 0);
  const [dayType, setDayType] = useState<ScheduleDayType>(initial?.dayType ?? 'show');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      offset,
      dayType,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-surface-muted/40 p-4 sm:grid-cols-2"
      onSubmit={submit}
    >
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Day</span>
        <select
          className={inputClass}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {templateDayLabel(o, dayType)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Day type</span>
        <select
          className={inputClass}
          value={dayType}
          onChange={(e) => setDayType(e.target.value as ScheduleDayType)}
        >
          {SCHEDULE_DAY_TYPES.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Title (optional)</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Stage Build Day 1 + Pre Rig"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Description (optional)</span>
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Day notes (optional)</span>
        <textarea
          className={inputClass}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:min-h-0"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink sm:min-h-0"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
