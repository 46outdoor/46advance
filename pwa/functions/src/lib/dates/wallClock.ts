/**
 * 12-hour formatting for wall-clock 'HH:mm' strings (calendar feed digest lines).
 * Schedule items store wall-clock times ALREADY in the event's timezone, so this is
 * pure string work — no timezone math, no DST exposure. Callers validate the input
 * shape (the WALL_CLOCK_RE gate); these helpers assume well-formed 'HH:mm'.
 */

const WALL_CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The value when it's a valid 'HH:mm' wall-clock string, else null — the shared gate
 * for schedule item times (calendar push + feed digest). */
export const asWallClock = (v: unknown): string | null =>
  typeof v === 'string' && WALL_CLOCK_RE.test(v) ? v : null;

/** '08:00' → '8:00 AM'; '00:30' → '12:30 AM'; '12:05' → '12:05 PM'. */
export function formatWallClock12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Compact 12-hour range: a shared AM/PM suffix collapses onto the end time
 * ('08:00','09:00' → '8:00–9:00 AM'), differing suffixes keep both
 * ('23:30','01:00' → '11:30 PM–1:00 AM'); no end → just the start ('8:00 AM').
 */
export function formatWallClockRange(start: string, end: string | null): string {
  const startText = formatWallClock12h(start);
  if (!end) return startText;
  const endText = formatWallClock12h(end);
  const sharedSuffix = startText.slice(-2) === endText.slice(-2);
  return `${sharedSuffix ? startText.slice(0, -3) : startText}–${endText}`;
}
