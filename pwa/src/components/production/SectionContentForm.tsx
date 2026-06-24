import { useState, type FormEvent } from 'react';
import type { FieldDef, FieldValue, SectionContent } from '@/lib/advances/fields';

interface SectionContentFormProps {
  fields: readonly FieldDef[];
  initial: SectionContent;
  readOnly: boolean;
  pending?: boolean;
  onSave: (content: SectionContent) => void;
}

const inputClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

function groupFields(fields: readonly FieldDef[]): [string, FieldDef[]][] {
  const groups = new Map<string, FieldDef[]>();
  for (const f of fields) {
    const g = f.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(f);
  }
  return [...groups.entries()];
}

function displayValue(v: FieldValue): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v === null || v === '') return '—';
  return String(v);
}

/** Registry-driven form for a department section's content fields. */
export function SectionContentForm({ fields, initial, readOnly, pending, onSave }: SectionContentFormProps) {
  const [values, setValues] = useState<SectionContent>(() => ({ ...initial }));

  const setValue = (key: string, value: FieldValue) => setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Drop empty strings so they don't count as data; keep booleans/numbers.
    const cleaned: SectionContent = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v === '' || v === undefined || v === null) continue;
      cleaned[f.key] = v;
    }
    onSave(cleaned);
  };

  if (readOnly) {
    return (
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="flex justify-between gap-3 border-b border-line/40 py-1 text-sm">
            <dt className="text-ink-muted">{f.label}</dt>
            <dd className="text-right text-ink">{displayValue(values[f.key] ?? null)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {groupFields(fields).map(([group, groupFieldDefs]) => (
        <div key={group} className="space-y-2">
          {group && <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{group}</h4>}
          <div className="grid gap-3 sm:grid-cols-2">
            {groupFieldDefs.map((f) => (
              <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} />
            ))}
          </div>
        </div>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save section'}
      </button>
    </form>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }

  const label = <span className="mb-1 block font-semibold text-ink">{field.label}</span>;
  const str = value === null || value === undefined ? '' : String(value);

  if (field.type === 'longtext') {
    return (
      <label className="block text-sm sm:col-span-2">
        {label}
        <textarea className={inputClass} rows={2} value={str} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === 'number') {
    return (
      <label className="block text-sm">
        {label}
        <input
          type="number"
          className={inputClass}
          value={str}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="block text-sm">
        {label}
        <select className={inputClass} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block text-sm">
      {label}
      <input className={inputClass} value={str} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
