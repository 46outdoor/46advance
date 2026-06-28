/**
 * Lineup slot dropdown (Headliner / Direct Support / Artist N) with an "add another" option.
 * Shared by the advance form (a slot on the act) and the schedule form (a slot placeholder
 * that resolves to the artist holding it). Labels come from `slotLabel`.
 */
import { useState } from 'react';
import { slotLabel } from '@/lib/advances/advance';

const defaultSelectClass = 'w-full rounded border border-line px-3 py-2 outline-none focus:border-brand';

export function SlotSelect({
  slot,
  onChange,
  selectClass = defaultSelectClass,
}: {
  slot: number | null;
  onChange: (slot: number | null) => void;
  selectClass?: string;
}) {
  const [maxSlot, setMaxSlot] = useState(Math.max(5, slot ?? 0));
  return (
    <div className="flex gap-2">
      <select
        className={selectClass}
        value={slot ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— No slot —</option>
        {Array.from({ length: maxSlot }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {slotLabel(n)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          const next = maxSlot + 1;
          setMaxSlot(next);
          onChange(next);
        }}
        className="shrink-0 rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:border-accent hover:text-accent"
      >
        + Add
      </button>
    </div>
  );
}
