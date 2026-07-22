import { useState, type FormEvent } from 'react';
import { advanceInputSchema, type AdvanceInput } from '@/lib/advances/advance';
import { SlotSelect } from '@/components/lineup/SlotSelect';
import { dateToZonedInput, dayKeyToInstant, zonedDayKey, zonedInputToDate } from '@/lib/dates/timezone';

interface AdvanceFormProps {
  initial?: {
    artistName: string;
    performanceDate: Date | null;
    slot: number | null;
    notes: string | null;
    additions: string | null;
    concerns: string | null;
    pending: string | null;
    advanceCallAt: Date | null;
    advanceCallLink: string | null;
  };
  /** The event's performance days; when present, the date becomes a day dropdown. */
  days?: Date[];
  /** The event's timezone — performanceDate (date-only) and advanceCallAt (instant) are read/written
   *  in it, so the same day/time round-trips regardless of the editor's browser zone (F-6). */
  timeZone: string;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: AdvanceInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Performance day: a dropdown of the event's days when known, else a free date input. */
function DaySelect({
  days,
  value,
  timeZone,
  onChange,
}: {
  days?: Date[];
  value: string;
  timeZone: string;
  onChange: (v: string) => void;
}) {
  if (days && days.length > 0) {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select a day —</option>
        {days.map((day) => {
          const v = zonedDayKey(day, timeZone);
          return (
            <option key={v} value={v}>
              {new Intl.DateTimeFormat('en-US', {
                timeZone,
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              }).format(day)}
            </option>
          );
        })}
      </select>
    );
  }
  return <input type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Create/edit form for an advance. Validates with advanceInputSchema. */
export function AdvanceForm({
  initial,
  days,
  timeZone,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: AdvanceFormProps) {
  const [artistName, setArtistName] = useState(initial?.artistName ?? '');
  const [performanceDate, setPerformanceDate] = useState(zonedDayKey(initial?.performanceDate ?? null, timeZone));
  const [slot, setSlot] = useState<number | null>(initial?.slot ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [additions, setAdditions] = useState(initial?.additions ?? '');
  const [concerns, setConcerns] = useState(initial?.concerns ?? '');
  const [pendingItems, setPendingItems] = useState(initial?.pending ?? '');
  const [advanceCallAt, setAdvanceCallAt] = useState(dateToZonedInput(initial?.advanceCallAt ?? null, timeZone));
  const [advanceCallLink, setAdvanceCallLink] = useState(initial?.advanceCallLink ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = advanceInputSchema.safeParse({
      artistName,
      performanceDate: dayKeyToInstant(performanceDate, timeZone),
      slot,
      notes: notes.trim() || undefined,
      additions: additions.trim() || undefined,
      concerns: concerns.trim() || undefined,
      pending: pendingItems.trim() || undefined,
      advanceCallAt: zonedInputToDate(advanceCallAt, timeZone),
      advanceCallLink: advanceCallLink.trim() || undefined,
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
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Artist / performance</span>
        <input className={inputClass} value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Headliner" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Performance day</span>
        <DaySelect days={days} value={performanceDate} timeZone={timeZone} onChange={setPerformanceDate} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Slot</span>
        <SlotSelect slot={slot} onChange={setSlot} />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Notes</span>
        <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink">Additions (requests outside the festival package)</span>
        <textarea className={inputClass} rows={2} value={additions} onChange={(e) => setAdditions(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Concerns</span>
        <textarea className={inputClass} rows={2} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Pending items</span>
        <textarea className={inputClass} rows={2} value={pendingItems} onChange={(e) => setPendingItems(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Advance call — date/time</span>
        <input type="datetime-local" className={inputClass} value={advanceCallAt} onChange={(e) => setAdvanceCallAt(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Advance call — meeting link</span>
        <input className={inputClass} value={advanceCallLink} onChange={(e) => setAdvanceCallLink(e.target.value)} placeholder="https://meet.google.com/…" />
      </label>
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
