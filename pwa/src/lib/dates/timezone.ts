/**
 * Timezone-explicit conversions for advance-call times. The app's operating zone is
 * **Central** (`America/Chicago`); every wall-clock ⇄ UTC-instant conversion goes through
 * here so nothing silently uses the browser's local zone. DST-aware (CST/CDT).
 *
 * Invariant: a `Date` is always an absolute UTC instant. "Wall clock" strings
 * ('YYYY-MM-DDTHH:mm') are interpreted **in `timeZone`**, not local time.
 */

export const APP_TIME_ZONE = 'America/Chicago';

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

const CENTRAL_DATETIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** Human-readable date+time in Central with the zone label, e.g. "Wed, Jun 24, 4:00 PM CDT". */
export function formatCentralDateTime(date: Date | null): string {
  return date ? CENTRAL_DATETIME_FMT.format(date) : '—';
}

const CENTRAL_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const CENTRAL_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

/** Date only, in Central, e.g. "Wed, Jun 24". */
export function formatCentralDate(date: Date | null): string {
  return date ? CENTRAL_DATE_FMT.format(date) : '—';
}

/** Time only, in Central, e.g. "4:00 PM" (empty string for null). */
export function formatCentralTime(date: Date | null): string {
  return date ? CENTRAL_TIME_FMT.format(date) : '';
}

/** Stable per-day key (`YYYY-MM-DD` in Central) for grouping items by day. */
export function centralDayKey(date: Date | null): string {
  return date ? dateToZonedInput(date).slice(0, 10) : '';
}
