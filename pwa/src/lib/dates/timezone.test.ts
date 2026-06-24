import { describe, it, expect } from 'vitest';
import {
  APP_TIME_ZONE,
  tzOffsetMillis,
  zonedInputToDate,
  dateToZonedInput,
  formatCentralDateTime,
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
});
