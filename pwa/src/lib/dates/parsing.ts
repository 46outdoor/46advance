/** Canonical date parsing helpers (see AGENTS.md canonical sources). */

/** Parse an `<input type="date">` value ('YYYY-MM-DD') to a local-midnight Date, or null. */
export function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Format a Date as an `<input type="date">` value ('YYYY-MM-DD'), or '' for null. */
export function dateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
