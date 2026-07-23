import { useState } from 'react';
import type { ProductionLink } from '@/lib/production/production';

const inputClass =
  'w-full rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-brand';
const empty: ProductionLink = { label: '', url: '' };

interface Props {
  initial: ProductionLink[];
  readOnly: boolean;
  pending?: boolean;
  onSave: (links: ProductionLink[]) => void;
}

/** Editable list of reference links (CAD / Drive / plots). */
export function ProductionLinksEditor({ initial, readOnly, pending, onSave }: Props) {
  const [rows, setRows] = useState<ProductionLink[]>(() =>
    initial.length ? initial : [{ ...empty }],
  );

  const update = (i: number, key: keyof ProductionLink, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  if (readOnly) {
    if (initial.length === 0) return <p className="text-sm text-ink-muted">No links.</p>;
    return (
      <ul className="space-y-1 text-sm">
        {initial.map((l, i) => (
          <li key={i}>
            <a className="text-accent underline" href={l.url} target="_blank" rel="noreferrer">
              {l.label || l.url}
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            className={inputClass}
            placeholder="Label"
            value={r.label}
            onChange={(e) => update(i, 'label', e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="https://…"
            value={r.url}
            onChange={(e) => update(i, 'url', e.target.value)}
          />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            className="rounded border border-line px-2 text-xs text-ink-muted hover:border-accent hover:text-accent"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { ...empty }])}
          className="text-sm text-ink-muted hover:text-ink"
        >
          + Add link
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(rows.filter((r) => r.url.trim()))}
          className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save links'}
        </button>
      </div>
    </div>
  );
}
