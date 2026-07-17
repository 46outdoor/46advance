/** Canonical date formatting helpers (see AGENTS.md canonical sources). */
import { parseDateInput } from './parsing';

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const DAY_KEY_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** "Tue, Jul 14, 2026" for a 'YYYY-MM-DD' day key (plain calendar day, no timezone
 * math); em dash for an unparseable key. */
export function formatDateKey(dateKey: string): string {
  const date = parseDateInput(dateKey);
  return date ? DAY_KEY_FMT.format(date) : '—';
}

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

/** Compact duration display: 600 → "10h", 270 → "4h 30m", 45 → "45m". Rounds the
 * total first so fractional inputs can't split into "1h 60m". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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
