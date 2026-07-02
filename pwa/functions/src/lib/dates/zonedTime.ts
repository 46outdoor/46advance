/**
 * Timezone math for Cloud Functions — the server mirror of the client's
 * `pwa/src/lib/dates/timezone.ts`. Functions and the web app are separate TS toolchains
 * (nodenext/CJS vs bundler/ESM) with no shared package yet, so this logic is duplicated by
 * necessity. IT MUST STAY IN LOCKSTEP WITH THE CLIENT — a prior divergence here (deriving the
 * event day in the browser zone instead of the event zone) produced wrong schedule dates.
 * `zonedTime.test.ts` pins the same golden vectors the client's `timezone.test.ts` uses; if the
 * two implementations drift, one of those suites fails. (Long-term fix: a shared workspace.)
 */

/** Offset (ms) of `timeZone` from UTC at `at` (DST-aware). */
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
  for (const p of dtf.formatToParts(at)) if (p.type !== 'literal') map[p.type] = Number(p.value);
  const hour = map.hour % 24;
  const wallAsUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return wallAsUtc - at.getTime();
}

/** Parse a 'YYYY-MM-DDTHH:mm' wall-clock string interpreted in `timeZone` to a UTC Date. */
export function zonedInputToDate(value: string, timeZone: string): Date | null {
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMillis(timeZone, new Date(guess));
  let utc = guess - off1;
  const off2 = tzOffsetMillis(timeZone, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` day key of `instant` as seen in `timeZone`. */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) if (p.type !== 'literal') map[p.type] = Number(p.value);
  return `${map.year}-${pad2(map.month)}-${pad2(map.day)}`;
}

/** Shift a `YYYY-MM-DD` day key by whole calendar days (UTC arithmetic — DST-safe). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
