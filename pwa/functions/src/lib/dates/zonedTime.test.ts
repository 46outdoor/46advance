import { describe, it, expect } from 'vitest';
import { tzOffsetMillis, zonedInputToDate, zonedDayKey, shiftDayKey } from './zonedTime';

const TZ = 'America/Chicago';
const HOUR = 3_600_000;

// GOLDEN VECTORS — these MUST match the client's src/lib/dates/timezone.test.ts. This module is a
// hand-kept mirror of the client's timezone math (no shared package across the ESM/CJS boundary);
// if the two implementations drift, one of these two suites fails. That is the P2-16 parity lock.
describe('zonedTime (server mirror of client timezone.ts)', () => {
  it('offset is CDT (−5h) in summer, CST (−6h) in winter', () => {
    expect(tzOffsetMillis(TZ, new Date('2026-06-24T18:00:00Z'))).toBe(-5 * HOUR);
    expect(tzOffsetMillis(TZ, new Date('2026-01-15T18:00:00Z'))).toBe(-6 * HOUR);
  });

  it('zonedInputToDate interprets the wall clock in the zone', () => {
    expect(zonedInputToDate('2026-06-24T16:00', TZ)?.toISOString()).toBe('2026-06-24T21:00:00.000Z');
    expect(zonedInputToDate('2026-01-15T12:00', TZ)?.toISOString()).toBe('2026-01-15T18:00:00.000Z');
    expect(zonedInputToDate('bad', TZ)).toBeNull();
  });

  it('zonedDayKey returns the calendar day in the zone, not UTC', () => {
    expect(zonedDayKey(new Date('2026-06-24T21:00:00Z'), TZ)).toBe('2026-06-24');
    // 00:30 UTC on the 27th is still the 26th in Central (19:30 CDT).
    expect(zonedDayKey(new Date('2026-06-27T00:30:00Z'), TZ)).toBe('2026-06-26');
  });

  it('shiftDayKey moves whole calendar days across month/DST boundaries', () => {
    expect(shiftDayKey('2026-06-30', 1)).toBe('2026-07-01');
    expect(shiftDayKey('2026-06-26', -1)).toBe('2026-06-25');
    expect(shiftDayKey('2026-03-08', 1)).toBe('2026-03-09'); // spring-forward day: still +1 calendar day
  });

  it('round-trips a wall clock through zonedInputToDate → zonedDayKey', () => {
    const d = zonedInputToDate('2026-06-26T23:30', TZ);
    expect(d).not.toBeNull();
    expect(zonedDayKey(d as Date, TZ)).toBe('2026-06-26');
  });
});
