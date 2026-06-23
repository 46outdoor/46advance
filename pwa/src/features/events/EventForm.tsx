import { useState, type FormEvent } from 'react';
import { EVENT_STATUSES, eventInputSchema, type EventInput, type EventStatus } from '@/lib/events/event';
import { dateInputValue, parseDateInput } from '@/lib/dates/parsing';

interface EventFormProps {
  initial?: {
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    venue: string | null;
    status?: EventStatus;
  };
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  /** Show the status selector (edit mode); on create the event starts as draft. */
  showStatus?: boolean;
  onSubmit: (input: EventInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Create/edit form for an event. Validates with eventInputSchema before submitting. */
export function EventForm({
  initial,
  submitLabel,
  pending,
  error,
  showStatus,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [start, setStart] = useState(dateInputValue(initial?.startDate ?? null));
  const [end, setEnd] = useState(dateInputValue(initial?.endDate ?? null));
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? 'draft');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = eventInputSchema.safeParse({
      name,
      startDate: parseDateInput(start),
      endDate: parseDateInput(end),
      venue: venue.trim() || undefined,
      ...(showStatus ? { status } : {}),
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  return (
    <form className="grid gap-3 sm:grid-cols-2 sm:items-end" onSubmit={submit}>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Event name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Summerfest 2026" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Start date</span>
        <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">End date</span>
        <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Venue</span>
        <input className={inputClass} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Riverside Park" />
      </label>
      {showStatus && (
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-ink">Status</span>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </button>
        )}
        {(localError || error) && <span className="text-sm text-accent">{localError ?? error}</span>}
      </div>
    </form>
  );
}
