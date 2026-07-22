/** Canonical date parsing helpers (see AGENTS.md canonical sources). */

/** Parse an `<input type="date">` value ('YYYY-MM-DD') to a local-midnight Date, or null. */
export function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** True when 'YYYY-MM-DD' names a real calendar date — rejects rollovers like
 * 2026-02-31 (which `new Date` silently turns into March 3). */
export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
