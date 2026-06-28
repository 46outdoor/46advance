import { useState, type FormEvent } from 'react';
import { advanceInputSchema, slotLabel, type AdvanceInput } from '@/lib/advances/advance';
import { dateInputValue, dateTimeInputValue, parseDateInput, parseDateTimeInput } from '@/lib/dates/parsing';

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
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: AdvanceInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Performance day: a dropdown of the event's days when known, else a free date input. */
function DaySelect({ days, value, onChange }: { days?: Date[]; value: string; onChange: (v: string) => void }) {
  if (days && days.length > 0) {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select a day —</option>
        {days.map((day) => {
          const v = dateInputValue(day);
          return (
            <option key={v} value={v}>
              {day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </option>
          );
        })}
      </select>
    );
  }
  return <input type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Lineup slot dropdown (Headliner / Direct Support / Artist N) with an "add another" option. */
function SlotSelect({ slot, onChange }: { slot: number | null; onChange: (slot: number | null) => void }) {
  const [maxSlot, setMaxSlot] = useState(Math.max(5, slot ?? 0));
  return (
    <div className="flex gap-2">
      <select
        className={inputClass}
        value={slot ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— No slot —</option>
        {Array.from({ length: maxSlot }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {slotLabel(n)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          const next = maxSlot + 1;
          setMaxSlot(next);
          onChange(next);
        }}
        className="shrink-0 rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent"
      >
        + Add
      </button>
    </div>
  );
}

/** Create/edit form for an advance. Validates with advanceInputSchema. */
export function AdvanceForm({ initial, days, submitLabel, pending, error, onSubmit, onCancel }: AdvanceFormProps) {
  const [artistName, setArtistName] = useState(initial?.artistName ?? '');
  const [performanceDate, setPerformanceDate] = useState(dateInputValue(initial?.performanceDate ?? null));
  const [slot, setSlot] = useState<number | null>(initial?.slot ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [additions, setAdditions] = useState(initial?.additions ?? '');
  const [concerns, setConcerns] = useState(initial?.concerns ?? '');
  const [pendingItems, setPendingItems] = useState(initial?.pending ?? '');
  const [advanceCallAt, setAdvanceCallAt] = useState(dateTimeInputValue(initial?.advanceCallAt ?? null));
  const [advanceCallLink, setAdvanceCallLink] = useState(initial?.advanceCallLink ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = advanceInputSchema.safeParse({
      artistName,
      performanceDate: parseDateInput(performanceDate),
      slot,
      notes: notes.trim() || undefined,
      additions: additions.trim() || undefined,
      concerns: concerns.trim() || undefined,
      pending: pendingItems.trim() || undefined,
      advanceCallAt: parseDateTimeInput(advanceCallAt),
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
        <DaySelect days={days} value={performanceDate} onChange={setPerformanceDate} />
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
