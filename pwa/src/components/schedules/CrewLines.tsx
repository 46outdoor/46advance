/**
 * Labor crew lines. View: the aligned mini-grid (Qty | Crew type | Duration) under a
 * crew-bearing item — quantities right-aligned in tabular numerals so lines line up
 * (decision 16/17, planning/archive/feature/SCHEDULE_REDESIGN.md). Edit: per-line quantity/type/hours
 * inputs; types come from `config/crewTypes`; blank hours = the line runs the item's
 * window.
 */
import { formatMinutes } from '@/lib/dates/formatting';
import type { CrewLine } from '@/lib/schedules/scheduleDay';

export function CrewLinesGrid({ crew }: { crew: readonly CrewLine[] }) {
  if (crew.length === 0) return null;
  return (
    <div className="rounded bg-surface-muted/60 px-2 py-1 text-xs text-ink-muted">
      {crew.map((line, i) => (
        <div
          key={i}
          className={`grid grid-cols-[2.6rem_minmax(0,1fr)_4rem] gap-x-3 py-0.5 ${i > 0 ? 'border-t border-line/60' : ''}`}
        >
          <span className="text-right font-semibold tabular-nums text-ink">({line.quantity})</span>
          <span>{line.type}</span>
          <span className="tabular-nums">{line.hours != null ? formatMinutes(line.hours * 60) : ''}</span>
        </div>
      ))}
    </div>
  );
}

export function CrewLinesEditor({
  crew,
  crewTypes,
  inputClass,
  onChange,
}: {
  crew: readonly CrewLine[];
  crewTypes: readonly string[];
  inputClass: string;
  onChange: (crew: CrewLine[]) => void;
}) {
  const setLine = (i: number, patch: Partial<CrewLine>) =>
    onChange(crew.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Always offer the line's current type, even if it was since removed from the config.
  const options = (current: string) => {
    const set = new Set(crewTypes);
    if (current) set.add(current);
    return [...set];
  };
  return (
    <div className="space-y-1">
      <span className="block text-xs font-semibold text-ink">Crew</span>
      {crew.map((line, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            className={`${inputClass} w-20`}
            value={line.quantity}
            aria-label="Quantity"
            onChange={(e) => setLine(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
          />
          <select
            className={`${inputClass} w-56`}
            value={line.type}
            aria-label="Crew type"
            onChange={(e) => setLine(i, { type: e.target.value })}
          >
            {options(line.type).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={`${inputClass} w-24`}
            value={line.hours ?? ''}
            placeholder="hrs"
            aria-label="Hours"
            onChange={(e) => {
              const n = Number(e.target.value);
              // Enforce the declared minimum — native min= is never validated here.
              setLine(i, { hours: e.target.value === '' || !Number.isFinite(n) || n < 0.5 ? null : n });
            }}
          />
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-xs text-ink-muted hover:text-accent sm:min-h-0"
            onClick={() => onChange(crew.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-muted hover:text-accent sm:min-h-0"
        onClick={() => onChange([...crew, { type: crewTypes[0] ?? 'Stagehands', quantity: 1, hours: null }])}
      >
        + Add crew
      </button>
    </div>
  );
}
