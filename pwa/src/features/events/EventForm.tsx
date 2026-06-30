import { useState, type FormEvent } from 'react';
import { EVENT_STATUSES, eventInputSchema, type EventInput, type EventStatus } from '@/lib/events/event';
import { defaultEventSlug, slugify } from '@/lib/events/slug';
import type { DepartmentRecord } from '@/lib/departments/department';
import { dateInputValue, parseDateInput } from '@/lib/dates/parsing';
import { APP_TIME_ZONE, COMMON_TIME_ZONES } from '@/lib/dates/timezone';

interface EventFormProps {
  initial?: {
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    loadInDays?: number;
    loadOutDays?: number;
    timeZone?: string;
    venue: string | null;
    status?: EventStatus;
    departmentIds?: string[];
    bookingLabel?: string | null;
    slug?: string | null;
  };
  /** Available departments to enable. */
  departments: DepartmentRecord[];
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  /** Show the status selector (edit mode); on create the event starts as draft. */
  showStatus?: boolean;
  onSubmit: (input: EventInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Slug field state: tracks the booking label / name / year until the user edits it directly. */
function useEventSlug(initialSlug: string | null | undefined, name: string, bookingLabel: string, start: string) {
  const [slug, setSlug] = useState(initialSlug ?? '');
  const [touched, setTouched] = useState(Boolean(initialSlug));
  const value = touched ? slug : defaultEventSlug(bookingLabel.trim() || null, name, parseDateInput(start));
  return {
    value,
    onChange: (next: string) => {
      setSlug(next);
      setTouched(true);
    },
  };
}

/** Create/edit form for an event. Validates with eventInputSchema before submitting. */
export function EventForm({
  initial,
  departments,
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
  const [loadInDays, setLoadInDays] = useState(() => initial?.loadInDays ?? 0);
  const [loadOutDays, setLoadOutDays] = useState(() => initial?.loadOutDays ?? 0);
  const [timeZone, setTimeZone] = useState(() => initial?.timeZone ?? APP_TIME_ZONE);
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [bookingLabel, setBookingLabel] = useState(initial?.bookingLabel ?? '');
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? 'draft');
  // Default: edit keeps the event's departments; create enables all available.
  const [deptIds, setDeptIds] = useState<Set<string>>(
    () => new Set(initial?.departmentIds ?? departments.map((d) => d.id)),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const toggleDept = (id: string) =>
    setDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const slugField = useEventSlug(initial?.slug, name, bookingLabel, start);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = eventInputSchema.safeParse({
      name,
      startDate: parseDateInput(start),
      endDate: parseDateInput(end),
      loadInDays,
      loadOutDays,
      timeZone,
      venue: venue.trim() || undefined,
      departmentIds: departments.filter((d) => deptIds.has(d.id)).map((d) => d.id),
      bookingLabel: bookingLabel.trim() || undefined,
      slug: slugField.value.trim() || undefined,
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
        <span className="mb-1 block font-semibold text-ink">Show start date</span>
        <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Show end date</span>
        <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Load-in days</span>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={loadInDays}
          onChange={(e) => setLoadInDays(Math.max(0, Number(e.target.value)))}
        />
        <span className="mt-1 block text-xs text-ink-muted">Days before the show — adds them to the schedule.</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Load-out days</span>
        <input
          type="number"
          min={0}
          className={inputClass}
          value={loadOutDays}
          onChange={(e) => setLoadOutDays(Math.max(0, Number(e.target.value)))}
        />
        <span className="mt-1 block text-xs text-ink-muted">Days after the show — adds them to the schedule.</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Timezone</span>
        <select className={inputClass} value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
          {COMMON_TIME_ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Venue</span>
        <input className={inputClass} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Riverside Park" />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Booking label</span>
        <input
          className={inputClass}
          value={bookingLabel}
          onChange={(e) => setBookingLabel(e.target.value)}
          placeholder="RTC Ashland"
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Optional. The festival name as it appears in your Appointment Schedule booking titles, so
          booked advance calls map to this event during sync.
        </span>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">URL slug</span>
        <input
          className={inputClass}
          value={slugField.value}
          onChange={(e) => slugField.onChange(e.target.value)}
          placeholder="rtc-ashland-26"
        />
        <span className="mt-1 block text-xs text-ink-muted">
          Web address: <span className="font-mono">/events/{slugify(slugField.value) || '…'}</span>. Defaults from
          the booking label (or name) + year — edit to customize.
        </span>
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
      <fieldset className="block text-sm sm:col-span-2">
        <legend className="mb-1 font-semibold text-ink">Departments</legend>
        {departments.length === 0 ? (
          <p className="text-ink-muted">No departments configured yet (seed them in Admin).</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {departments.map((d) => (
              <label key={d.id} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={deptIds.has(d.id)} onChange={() => toggleDept(d.id)} />
                {d.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

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
