/**
 * Master-template composition manager: the ordered list of standard templates this
 * master applies (order matters — the first template defining an offset owns that
 * day's metadata; later ones only contribute items). One level deep by design.
 */
import { useState } from 'react';
import {
  scheduleTemplateCategoryLabel,
  type ScheduleTemplate,
} from '@/lib/schedules/scheduleTemplate';

const buttonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40 sm:min-h-0 sm:min-w-0';

export function MasterTemplateRefs({
  refs,
  standardTemplates,
  onChange,
}: {
  refs: readonly string[];
  standardTemplates: readonly ScheduleTemplate[];
  onChange: (refs: string[]) => void;
}) {
  const [adding, setAdding] = useState('');
  const byId = new Map(standardTemplates.map((t) => [t.id, t]));
  const available = standardTemplates.filter((t) => !refs.includes(t.id));
  const move = (index: number, delta: number) => {
    const next = [...refs];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <h2 className="text-sm font-bold text-ink">Composed templates</h2>
      <p className="text-xs text-ink-muted">
        Applied in order — the first template that defines a day owns its header; later ones add
        items to it.
      </p>
      {refs.length === 0 && <p className="text-sm text-ink-muted">Nothing composed yet.</p>}
      <ol className="space-y-1">
        {refs.map((id, i) => {
          const tpl = byId.get(id);
          return (
            <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-5 text-right text-xs text-ink-muted tabular-nums">{i + 1}.</span>
              <span className="font-semibold text-ink">
                {tpl ? tpl.name : `Missing template (${id})`}
              </span>
              {tpl && (
                <span className="text-xs text-ink-muted">
                  {scheduleTemplateCategoryLabel(tpl.category)}
                </span>
              )}
              <span className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${tpl?.name ?? id} up`}
                  className={buttonClass}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${tpl?.name ?? id} down`}
                  className={buttonClass}
                  disabled={i === refs.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => onChange(refs.filter((r) => r !== id))}
                >
                  Remove
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="min-h-11 rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand sm:min-h-0"
            value={adding}
            aria-label="Template to add"
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">Add a template…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {scheduleTemplateCategoryLabel(t.category)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!adding}
            className={buttonClass}
            onClick={() => {
              onChange([...refs, adding]);
              setAdding('');
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
