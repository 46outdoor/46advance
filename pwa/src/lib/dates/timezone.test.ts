import { describe, it, expect } from 'vitest';
import {
  APP_TIME_ZONE,
  tzOffsetMillis,
  zonedInputToDate,
  dateToZonedInput,
  formatCentralDateTime,
  formatCentralDate,
  formatCentralTime,
  centralDayKey,
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
    expect(centralDayKey(d)).toBe('2026-06-24');
    // 1:00 AM UTC Jun 25 is still Jun 24 in Central (8:00 PM CDT)
    expect(centralDayKey(new Date(Date.UTC(2026, 5, 25, 1, 0)))).toBe('2026-06-24');
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
