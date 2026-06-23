/** Canonical date formatting helpers (see AGENTS.md canonical sources). */

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Short human date, or em dash for null. */
export function formatDate(date: Date | null): string {
  return date ? DATE_FMT.format(date) : '—';
}

/** "Jul 1 – Jul 4, 2026" style range; collapses to a single date or em dash. */
export function formatDateRange(start: Date | null, end: Date | null): string {
  if (start && end) return `${DATE_FMT.format(start)} – ${DATE_FMT.format(end)}`;
  if (start || end) return formatDate(start ?? end);
  return '—';
}
