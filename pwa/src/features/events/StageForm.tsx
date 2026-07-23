import { useState, type FormEvent } from 'react';
import { stageInputSchema, type StageInput } from '@/lib/events/stage';

interface StageFormProps {
  initial?: { name: string; notes: string | null };
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: StageInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Create/edit form for a stage. */
export function StageForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: StageFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = stageInputSchema.safeParse({ name, notes: notes.trim() || undefined });
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
        <span className="mb-1 block font-semibold text-ink">Stage name</span>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Main Stage"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Notes</span>
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        )}
        {(localError || error) && (
          <span className="text-sm text-accent">{localError ?? error}</span>
        )}
      </div>
    </form>
  );
}
