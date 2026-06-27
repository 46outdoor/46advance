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
  // Order is derived from list position, so reordering is just swapping neighbors.
  const move = (index: number, delta: -1 | 1) =>
    setRows((p) => {
      const target = index + delta;
      if (target < 0 || target >= p.length) return p;
      const next = [...p];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const arrowClass =
    'flex h-11 w-11 items-center justify-center rounded border border-line text-ink-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink-muted';

  return (
    <div className="space-y-2">
      {rows.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              aria-label="Move stage up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className={arrowClass}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move stage down"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
              className={arrowClass}
            >
              ↓
            </button>
          </div>
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
