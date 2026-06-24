import { useState } from 'react';
import type { ProductionContact } from '@/lib/production/production';

const inputClass = 'w-full rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-brand';
const empty: ProductionContact = { role: '', name: '', phone: '', email: '' };

interface Props {
  initial: ProductionContact[];
  readOnly: boolean;
  pending?: boolean;
  onSave: (contacts: ProductionContact[]) => void;
}

/** Editable list of production contacts (role / name / phone / email). */
export function ProductionContactsEditor({ initial, readOnly, pending, onSave }: Props) {
  const [rows, setRows] = useState<ProductionContact[]>(() => (initial.length ? initial : [{ ...empty }]));

  const update = (i: number, key: keyof ProductionContact, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  if (readOnly) {
    if (initial.length === 0) return <p className="text-sm text-ink-muted">No contacts.</p>;
    return (
      <ul className="space-y-1 text-sm">
        {initial.map((c, i) => (
          <li key={i} className="flex flex-wrap gap-x-3">
            <span className="font-semibold text-ink">{c.role || '—'}</span>
            <span className="text-ink">{c.name}</span>
            {c.phone && <span className="text-ink-muted">{c.phone}</span>}
            {c.email && <span className="text-ink-muted">{c.email}</span>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <input className={inputClass} placeholder="Role" value={r.role} onChange={(e) => update(i, 'role', e.target.value)} />
          <input className={inputClass} placeholder="Name" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} />
          <input className={inputClass} placeholder="Phone" value={r.phone} onChange={(e) => update(i, 'phone', e.target.value)} />
          <input className={inputClass} placeholder="Email" value={r.email} onChange={(e) => update(i, 'email', e.target.value)} />
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
        <button type="button" onClick={() => setRows((prev) => [...prev, { ...empty }])} className="text-sm text-ink-muted hover:text-ink">
          + Add contact
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(rows.filter((r) => r.role || r.name || r.phone || r.email))}
          className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save contacts'}
        </button>
      </div>
    </div>
  );
}
