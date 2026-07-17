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

/** Format a Date as an `<input type="date">` value ('YYYY-MM-DD'), or '' for null. */
export function dateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse an `<input type="datetime-local">` value ('YYYY-MM-DDTHH:mm') to a local Date, or null. */
export function parseDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm);
}

/** Format a Date as an `<input type="datetime-local">` value ('YYYY-MM-DDTHH:mm'), or '' for null. */
export function dateTimeInputValue(date: Date | null): string {
  if (!date) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${dateInputValue(date)}T${hh}:${mm}`;
}
