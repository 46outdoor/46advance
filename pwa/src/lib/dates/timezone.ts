/**
 * Timezone-explicit conversions for advance-call times. The app's operating zone is
 * **Central** (`America/Chicago`); every wall-clock ⇄ UTC-instant conversion goes through
 * here so nothing silently uses the browser's local zone. DST-aware (CST/CDT).
 *
 * Invariant: a `Date` is always an absolute UTC instant. "Wall clock" strings
 * ('YYYY-MM-DDTHH:mm') are interpreted **in `timeZone`**, not local time.
 *
 * The Cloud Functions side has a hand-kept mirror of this math in
 * `functions/src/lib/dates/zonedTime.ts` (no shared package across the ESM/CJS boundary). Keep
 * the two in lockstep — a prior divergence produced wrong schedule dates; golden-vector tests on
 * both sides (this file's `timezone.test.ts` + `zonedTime.test.ts`) will fail if they drift.
 */

export const APP_TIME_ZONE = 'America/Chicago';

/** Common US timezones for the event timezone picker (IANA id + friendly label). */
export const COMMON_TIME_ZONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona (no DST)' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
];

/**
 * Offset (ms) of `timeZone` from UTC at the given instant — negative for zones west of
 * UTC (Central is −6h CST / −5h CDT). Computed by formatting the instant in the zone and
 * reading it back as if it were UTC.
 */
export function tzOffsetMillis(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const hour = map.hour % 24; // some engines render midnight as 24
  const wallAsUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return wallAsUtc - at.getTime();
}

/** Parse a 'YYYY-MM-DDTHH:mm' wall-clock string, interpreted in `timeZone`, to a UTC Date. */
export function zonedInputToDate(value: string, timeZone = APP_TIME_ZONE): Date | null {
  if (!value) return null;
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;

  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMillis(timeZone, new Date(guess));
  let utc = guess - off1;
  // Refine once: near a DST boundary the offset at the guess differs from the result.
  const off2 = tzOffsetMillis(timeZone, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** Format a UTC Date as a 'YYYY-MM-DDTHH:mm' wall-clock string in `timeZone` (for datetime-local). */
export function dateToZonedInput(date: Date | null, timeZone = APP_TIME_ZONE): string {
  if (!date) return '';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
};
const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };

/** Human date+time in `timeZone` with the zone label, e.g. "Wed, Jun 24, 4:00 PM CDT". Pass the
 *  event's timeZone when rendering an event instant (advance calls), so it reads in the event's
 *  local time regardless of the viewer's browser zone. */
export function formatZonedDateTime(date: Date | null, timeZone = APP_TIME_ZONE): string {
  return date ? new Intl.DateTimeFormat('en-US', { timeZone, ...DATETIME_OPTS }).format(date) : '—';
}

/** Human date only in `timeZone`, e.g. "Wed, Jun 24". Pass the event's timeZone for a date-only
 *  event field so the same calendar day shows for every viewer. */
export function formatZonedDate(date: Date | null, timeZone = APP_TIME_ZONE): string {
  return date ? new Intl.DateTimeFormat('en-US', { timeZone, ...DATE_OPTS }).format(date) : '—';
}

/** A date range in `timeZone`, e.g. "Wed, Jun 24 – Fri, Jun 26"; a single date when end is
 *  absent or the same calendar day. Use for event start→end so it reads the same in any zone. */
export function formatZonedDateRange(start: Date | null, end: Date | null, timeZone = APP_TIME_ZONE): string {
  if (!start) return '—';
  const s = formatZonedDate(start, timeZone);
  if (!end || zonedDayKey(start, timeZone) === zonedDayKey(end, timeZone)) return s;
  return `${s} – ${formatZonedDate(end, timeZone)}`;
}

/** Central-fixed convenience — prefer `formatZonedDateTime(date, event.timeZone)` where an event
 *  timeZone is available. */
export const formatCentralDateTime = (date: Date | null): string => formatZonedDateTime(date, APP_TIME_ZONE);
/** Central-fixed convenience — prefer `formatZonedDate(date, event.timeZone)`. */
export const formatCentralDate = (date: Date | null): string => formatZonedDate(date, APP_TIME_ZONE);

const CENTRAL_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

/** Time only, in Central, e.g. "4:00 PM" (empty string for null). */
export function formatCentralTime(date: Date | null): string {
  return date ? CENTRAL_TIME_FMT.format(date) : '';
}

/** Stable per-day key (`YYYY-MM-DD` in `timeZone`) for grouping items by day. */
export function zonedDayKey(date: Date | null, timeZone = APP_TIME_ZONE): string {
  return date ? dateToZonedInput(date, timeZone).slice(0, 10) : '';
}

/** A date-only calendar day (`YYYY-MM-DD`) → the instant at midnight that day in `timeZone`. Use
 *  for a date-only event field (event start/end, advance performanceDate): storing midnight in the
 *  EVENT zone (not the browser's) keeps the calendar day stable across editor/viewer zones (F-6).
 *  Read the day back with `zonedDayKey(instant, timeZone)`. */
export function dayKeyToInstant(dayKey: string, timeZone = APP_TIME_ZONE): Date | null {
  return dayKey ? zonedInputToDate(`${dayKey}T00:00`, timeZone) : null;
}

/** Shift a `YYYY-MM-DD` day key by whole calendar days (UTC arithmetic — DST-safe). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
