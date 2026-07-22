import { describe, it, expect } from 'vitest';
import {
  APP_TIME_ZONE,
  tzOffsetMillis,
  zonedInputToDate,
  dateToZonedInput,
  dayKeyToInstant,
  zonedDayKey,
  formatCentralDateTime,
  formatCentralDate,
  formatCentralTime,
  formatZonedDate,
  formatZonedDateRange,
  formatZonedDateTime,
  shiftDayKey,
} from './timezone';

const HOUR = 3_600_000;

describe('timezone — Central (America/Chicago) conversions', () => {
  it('offset is CDT (−5h) in summer and CST (−6h) in winter', () => {
    expect(tzOffsetMillis(APP_TIME_ZONE, new Date(Date.UTC(2026, 5, 24, 21, 0)))).toBe(-5 * HOUR);
    expect(tzOffsetMillis(APP_TIME_ZONE, new Date(Date.UTC(2026, 0, 15, 15, 0)))).toBe(-6 * HOUR);
  });

  it('zonedInputToDate treats the wall clock as Central, not local (summer / CDT)', () => {
    // 4:00 PM Central on Jun 24 2026 = 21:00 UTC (CDT, −5h).
    expect(zonedInputToDate('2026-06-24T16:00')!.getTime()).toBe(Date.UTC(2026, 5, 24, 21, 0));
  });

  it('zonedInputToDate handles winter (CST / −6h)', () => {
    // 9:00 AM Central on Jan 15 2026 = 15:00 UTC (CST, −6h).
    expect(zonedInputToDate('2026-01-15T09:00')!.getTime()).toBe(Date.UTC(2026, 0, 15, 15, 0));
  });

  it('dateToZonedInput renders a UTC instant as the Central wall clock', () => {
    expect(dateToZonedInput(new Date(Date.UTC(2026, 5, 24, 21, 0)))).toBe('2026-06-24T16:00');
    expect(dateToZonedInput(new Date(Date.UTC(2026, 0, 15, 15, 0)))).toBe('2026-01-15T09:00');
  });

  it('round-trips input → date → input across both DST states', () => {
    for (const v of ['2026-06-24T16:00', '2026-01-15T09:00', '2026-07-01T00:00']) {
      expect(dateToZonedInput(zonedInputToDate(v))).toBe(v);
    }
  });

  it('null-safe', () => {
    expect(zonedInputToDate('')).toBeNull();
    expect(dateToZonedInput(null)).toBe('');
    expect(formatCentralDateTime(null)).toBe('—');
  });

  it('formatCentralDateTime shows the Central zone label', () => {
    expect(formatCentralDateTime(new Date(Date.UTC(2026, 5, 24, 21, 0)))).toContain('CDT');
    expect(formatCentralDateTime(new Date(Date.UTC(2026, 0, 15, 15, 0)))).toContain('CST');
  });

  it('date / time / day-key helpers render in Central', () => {
    const d = new Date(Date.UTC(2026, 5, 24, 21, 0)); // 4:00 PM CDT, Jun 24
    expect(formatCentralDate(d)).toContain('Jun 24');
    expect(formatCentralTime(d)).toBe('4:00 PM');
    expect(formatCentralTime(null)).toBe('');
  });

  it('shiftDayKey moves whole calendar days across month/DST boundaries', () => {
    expect(shiftDayKey('2026-06-26', 1)).toBe('2026-06-27');
    expect(shiftDayKey('2026-06-26', -1)).toBe('2026-06-25');
    expect(shiftDayKey('2026-06-30', 1)).toBe('2026-07-01'); // month rollover
    expect(shiftDayKey('2026-03-08', 1)).toBe('2026-03-09'); // spring-forward day: still +1 calendar day
    expect(shiftDayKey('2026-06-26', 0)).toBe('2026-06-26');
  });
});

describe('date-only helpers are event-zone-based across zones + DST (F-6)', () => {
  const ZONES = ['America/Chicago', 'UTC', 'America/Los_Angeles', 'America/New_York'];

  it('dayKeyToInstant → zonedDayKey round-trips to the same day in every zone, incl. DST boundaries', () => {
    for (const tz of ZONES) {
      for (const key of ['2026-06-28', '2026-01-15', '2026-03-08', '2026-11-01']) {
        expect(zonedDayKey(dayKeyToInstant(key, tz), tz)).toBe(key);
      }
    }
  });

  it('the same day key maps to a DIFFERENT instant per zone (midnight is zone-local)', () => {
    const chi = dayKeyToInstant('2026-06-28', 'America/Chicago')!;
    const la = dayKeyToInstant('2026-06-28', 'America/Los_Angeles')!;
    const utc = dayKeyToInstant('2026-06-28', 'UTC')!;
    expect(chi.getTime()).not.toBe(la.getTime());
    expect(chi.getTime()).not.toBe(utc.getTime());
    expect(la.getTime() - chi.getTime()).toBe(2 * HOUR); // PDT midnight is 2h after CDT midnight
  });

  it('an event-zone-midnight instant reads as the same calendar day for every viewer', () => {
    const instant = dayKeyToInstant('2026-07-14', 'America/New_York');
    expect(zonedDayKey(instant, 'America/New_York')).toBe('2026-07-14');
    expect(formatZonedDate(instant, 'America/New_York')).toContain('Jul 14');
  });

  it('formatZonedDateRange collapses a single day and joins a range', () => {
    const tz = 'America/Chicago';
    const d1 = dayKeyToInstant('2026-06-26', tz);
    const d2 = dayKeyToInstant('2026-06-28', tz);
    expect(formatZonedDateRange(d1, d1, tz)).toBe(formatZonedDate(d1, tz));
    expect(formatZonedDateRange(d1, d2, tz)).toContain('–');
    expect(formatZonedDateRange(null, null, tz)).toBe('—');
  });

  it('formatZonedDateTime renders an instant in the given zone with its label', () => {
    const at = new Date(Date.UTC(2026, 5, 24, 21, 0)); // 4pm CDT / 2pm PDT
    expect(formatZonedDateTime(at, 'America/Chicago')).toContain('CDT');
    expect(formatZonedDateTime(at, 'America/Los_Angeles')).toContain('PDT');
  });
});
