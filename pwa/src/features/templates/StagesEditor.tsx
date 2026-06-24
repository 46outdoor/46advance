import { useState } from 'react';
import type { TemplateStage } from '@/lib/templates/template';

const inputClass = 'rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand';

interface Props {
  initial: TemplateStage[];
  pending?: boolean;
  onSave: (stages: TemplateStage[]) => void;
}

/** Edit a template's stage list (name + order). Stage ids are stable for per-stage production. */
export function StagesEditor({ initial, pending, onSave }: Props) {
  const [rows, setRows] = useState<TemplateStage[]>(initial);

  const add = () => setRows((p) => [...p, { id: crypto.randomUUID(), name: '', order: p.length }]);
  const rename = (id: string, name: string) =>
    setRows((p) => p.map((s) => (s.id === id ? { ...s, name } : s)));
  const remove = (id: string) => setRows((p) => p.filter((s) => s.id !== id));

  return (
    <div className="space-y-2">
      {rows.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <input
            className={`${inputClass} w-64`}
            placeholder="Stage name (e.g. Main Stage)"
            value={s.name}
            onChange={(e) => rename(s.id, e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(s.id)}
            className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted hover:border-accent hover:text-accent"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" onClick={add} className="text-sm text-ink-muted hover:text-ink">
          + Add stage
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(rows.filter((s) => s.name.trim()).map((s, i) => ({ ...s, order: i })))}
          className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save stages'}
        </button>
      </div>
    </div>
  );
}
