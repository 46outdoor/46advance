import { useState, type FormEvent } from 'react';
import {
  formatMoney,
  lineItemTotal,
  quoteInputSchema,
  quoteTotal,
  type Quote,
  type QuoteInput,
  type QuoteLineItem,
} from '@/lib/quotes/quote';

interface QuoteFormProps {
  initial?: Quote;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: QuoteInput) => void;
  onCancel?: () => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

/** Editable line item; amounts kept as strings while typing, parsed on submit. */
interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
}

const toDraft = (item: QuoteLineItem): DraftLine => ({
  description: item.description,
  quantity: String(item.quantity),
  unitPrice: String(item.unitPrice),
});

const emptyLine = (): DraftLine => ({ description: '', quantity: '1', unitPrice: '0' });

/** Create/edit form for a quote, with a line-item editor + live total. */
export function QuoteForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: QuoteFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    initial?.lineItems.length ? initial.lineItems.map(toDraft) : [emptyLine()],
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const parsedLines: QuoteLineItem[] = lines.map((l) => ({
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    unitPrice: Number(l.unitPrice) || 0,
  }));
  const total = quoteTotal(parsedLines);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = quoteInputSchema.safeParse({
      title,
      notes: notes.trim() || undefined,
      lineItems: parsedLines,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Title</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Backline rental"
        />
      </label>

      <div className="space-y-2">
        <span className="block text-sm font-semibold text-ink">Line items</span>
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <input
              className={`${inputClass} col-span-6`}
              value={line.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              placeholder="Description"
            />
            <input
              type="number"
              min="0"
              step="any"
              className={`${inputClass} col-span-2`}
              value={line.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
              placeholder="Qty"
              aria-label="Quantity"
            />
            <input
              type="number"
              min="0"
              step="any"
              className={`${inputClass} col-span-2`}
              value={line.unitPrice}
              onChange={(e) => setLine(i, { unitPrice: e.target.value })}
              placeholder="Unit"
              aria-label="Unit price"
            />
            <span className="col-span-1 text-right text-sm text-ink-muted">
              {formatMoney(lineItemTotal(parsedLines[i]))}
            </span>
            <button
              type="button"
              onClick={() => removeLine(i)}
              className="col-span-1 text-ink-muted hover:text-accent disabled:opacity-30"
              disabled={lines.length === 1}
              aria-label="Remove line item"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" onClick={addLine} className="text-sm text-accent hover:underline">
            + Add line item
          </button>
          <span className="text-sm font-semibold text-ink">Total: {formatMoney(total)}</span>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink">Notes</span>
        <textarea
          className={inputClass}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
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
