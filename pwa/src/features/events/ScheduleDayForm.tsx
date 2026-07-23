/**
 * Add/edit a schedule day's metadata: date, day type (drives the header color), title,
 * description, and the small day-notes field. Items live in the grid, not here. On an
 * existing day a date change re-keys the doc — the screen routes that through
 * `redateScheduleDay`.
 */
import { useState, type FormEvent } from 'react';
import { SCHEDULE_DAY_TYPES, type ScheduleDayType } from '@/lib/schedules/dayTypes';
import {
  scheduleDayMetaSchema,
  type ScheduleDay,
  type ScheduleDayMeta,
} from '@/lib/schedules/scheduleDay';

const inputClass =
  'min-h-11 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand sm:min-h-0';

export function ScheduleDayForm({
  initial,
  defaultDate,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: ScheduleDay;
  /** Suggested date for a new day (e.g. the event's start date). */
  defaultDate?: string;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (meta: ScheduleDayMeta) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? '');
  const [dayType, setDayType] = useState<ScheduleDayType>(initial?.dayType ?? 'show');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = scheduleDayMetaSchema.safeParse({
      date,
      dayType,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-surface-muted/40 p-4 sm:grid-cols-2"
      onSubmit={submit}
    >
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Date</span>
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
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
          placeholder="Shown inline in the day header"
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
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink sm:min-h-0"
        >
          Cancel
        </button>
        {(localError ?? error) && (
          <span className="text-sm text-accent">{localError ?? error}</span>
        )}
      </div>
    </form>
  );
}
