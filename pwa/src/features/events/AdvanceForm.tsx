import { useState, type FormEvent } from 'react';
import { advanceInputSchema, type AdvanceInput } from '@/lib/advances/advance';
import { dateInputValue, parseDateInput } from '@/lib/dates/parsing';

interface AdvanceFormProps {
  initial?: {
    artistName: string;
    performanceDate: Date | null;
    stage: string | null;
    notes: string | null;
    additions: string | null;
    concerns: string | null;
    pending: string | null;
  };
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: AdvanceInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Create/edit form for an advance. Validates with advanceInputSchema. */
export function AdvanceForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: AdvanceFormProps) {
  const [artistName, setArtistName] = useState(initial?.artistName ?? '');
  const [performanceDate, setPerformanceDate] = useState(dateInputValue(initial?.performanceDate ?? null));
  const [stage, setStage] = useState(initial?.stage ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [additions, setAdditions] = useState(initial?.additions ?? '');
  const [concerns, setConcerns] = useState(initial?.concerns ?? '');
  const [pendingItems, setPendingItems] = useState(initial?.pending ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = advanceInputSchema.safeParse({
      artistName,
      performanceDate: parseDateInput(performanceDate),
      stage: stage.trim() || undefined,
      notes: notes.trim() || undefined,
      additions: additions.trim() || undefined,
      concerns: concerns.trim() || undefined,
      pending: pendingItems.trim() || undefined,
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
        <span className="mb-1 block font-semibold text-ink">Performance date</span>
        <input type="date" className={inputClass} value={performanceDate} onChange={(e) => setPerformanceDate(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Stage</span>
        <input className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Main Stage" />
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
