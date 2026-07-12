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

/** 12-hour display for an 'HH:mm' wall-clock string ('08:00' → '8:00 AM', '22:30' → '10:30 PM').
 * Pure string formatting — no Date or timezone conversion involved. */
export function formatWallClockTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return time;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
