/** Canonical date/time calculation helpers (see AGENTS.md canonical sources). */

function wallClockMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Minutes between two 'HH:mm' wall-clock times — an end at or before the start wraps
 * overnight (22:00 → 02:00 = 240). Null without both times or for a zero span. */
export function spanMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const span = (wallClockMinutes(end) - wallClockMinutes(start) + 1440) % 1440;
  return span > 0 ? span : null;
}
