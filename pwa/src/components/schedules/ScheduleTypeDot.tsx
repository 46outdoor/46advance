/**
 * Item-type color dot with a touch-reachable tooltip naming the type (tap/click toggles
 * it; hover gets the native title), plus the color-key legend a schedule shows for the
 * types currently visible under its filters.
 */
import { useState } from 'react';
import {
  scheduleItemTypeDef,
  scheduleItemTypeLabel,
  type ScheduleItemType,
} from '@/lib/schedules/itemTypes';

interface TypeRef {
  type: ScheduleItemType;
  customLabel: string | null;
}

export function ScheduleTypeDot({ type, customLabel }: TypeRef) {
  const [open, setOpen] = useState(false);
  const label = scheduleItemTypeLabel(type, customLabel);
  return (
    <button
      type="button"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center sm:-m-2 sm:min-h-0 sm:min-w-0 sm:p-2"
      title={label}
      aria-label={label}
      onClick={() => setOpen((o) => !o)}
      onBlur={() => setOpen(false)}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: scheduleItemTypeDef(type).color }}
      />
      {open && (
        <span className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-0.5 text-[0.65rem] font-semibold text-surface">
          {label}
        </span>
      )}
    </button>
  );
}

/** Color key for the item types visible in the current (filtered) schedule. Keyed by
 * type + custom label (not display label alone) so a custom type reusing a built-in
 * name can't hijack that name's color in the key. */
export function ScheduleTypeLegend({ items }: { items: readonly TypeRef[] }) {
  const seen = new Map<string, { label: string; color: string }>();
  for (const it of items) {
    const key = `${it.type}:${it.customLabel ?? ''}`;
    if (!seen.has(key)) {
      seen.set(key, {
        label: scheduleItemTypeLabel(it.type, it.customLabel),
        color: scheduleItemTypeDef(it.type).color,
      });
    }
  }
  if (seen.size === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      <span className="text-[0.65rem] font-semibold uppercase tracking-wide">Key</span>
      {[...seen].map(([key, { label, color }]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
